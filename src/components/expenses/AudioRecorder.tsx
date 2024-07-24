import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { FaMicrophone, FaStop, FaPlay, FaPause, FaUpload, FaTrash } from 'react-icons/fa';
import { uploadExpenseFile } from '../../services/api';
import { Expense } from '../../types';
import { theme } from '../../styles/theme';
import SubmitButton from '../common/SubmitButton';
import ErrorModal from '../common/ErrorModal';
import LoadingOverlay from '../common/LoadingOverlay';
import axios from 'axios';

const createAudioContext = (): AudioContext => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  return new AudioContextClass();
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.padding.large};
  padding: ${theme.padding.large};
  background-color: ${theme.colors.backgroundLight};
  border-radius: ${theme.borderRadius};
  box-shadow: ${theme.boxShadow};
`;

const WaveformContainer = styled.div<{ isVisible: boolean }>`
  width: 100%;
  height: 100px;
  background-color: ${theme.colors.waveformBackground};
  border-radius: ${theme.borderRadius};
  overflow: hidden;
  display: ${props => (props.isVisible ? 'block' : 'none')};
  position: relative;
`;

const Waveform = styled.canvas`
  width: 100%;
  height: 100%;
`;

const PlaybackPosition = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: ${theme.colors.error};
  transition: left 0.1s linear;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: ${theme.padding.medium};
  justify-content: center;
`;

const ActionButton = styled.button<{ isActive?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background-color: ${props => props.isActive ? theme.colors.error : theme.colors.primary};
  color: ${theme.colors.backgroundLight};
  font-size: ${theme.fontSize.large};
  cursor: pointer;
  transition: all ${theme.transition};

  &:hover {
    transform: scale(1.05);
    background-color: ${props => props.isActive ? theme.colors.error : theme.colors.primaryHover};
  }

  &:disabled {
    background-color: ${theme.colors.disabled};
    cursor: not-allowed;
  }
`;

const FileInput = styled.input`
  display: none;
`;

const FileButton = styled.label`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  background-color: ${theme.colors.primary};
  color: ${theme.colors.backgroundLight};
  border: none;
  border-radius: ${theme.borderRadius};
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background-color: ${theme.colors.primaryHover};
  }

  svg {
    margin-right: 0.5rem;
  }
`;

const StatusText = styled.p`
  font-size: ${theme.fontSize.medium};
  color: ${theme.colors.text};
  margin: 0;
`;

interface AudioRecorderProps {
  onUploadComplete: (expense: Expense) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onUploadComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<'recorded' | 'uploaded' | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.addEventListener('timeupdate', updatePlaybackPosition);
      audioElement.addEventListener('ended', () => setIsPlaying(false));
    }
    return () => {
      if (audioElement) {
        audioElement.removeEventListener('timeupdate', updatePlaybackPosition);
        audioElement.removeEventListener('ended', () => setIsPlaying(false));
      }
    };
  }, []);

  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [audioBlob]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      const audioChunks: Blob[] = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
        setAudioSource('recorded');
        setIsRecording(false);
        visualizeAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setErrorMessage('No se pudo acceder al micrófono. Por favor, verifica los permisos e intenta de nuevo.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => {
          console.error("Error playing audio:", e);
          setErrorMessage('Error al reproducir el audio. Por favor, intenta de nuevo.');
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const updatePlaybackPosition = () => {
    if (audioRef.current && canvasRef.current) {
      const currentTime = audioRef.current.currentTime;
      const duration = audioRef.current.duration;
      const position = (currentTime / duration) * canvasRef.current.width;
      setPlaybackPosition(position);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioBlob(file);
      setAudioSource('uploaded');
      await visualizeAudio(file);
    }
  };

  const visualizeAudio = async (audioData: Blob | File) => {
    if (!canvasRef.current) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioData.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    canvasCtx.fillStyle = theme.colors.waveformBackground;
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = theme.colors.waveform;
    canvasCtx.beginPath();

    const channelData = audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / WIDTH);
    const amp = HEIGHT / 2;

    for (let i = 0; i < WIDTH; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = channelData[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      canvasCtx.moveTo(i, (1 + min) * amp);
      canvasCtx.lineTo(i, (1 + max) * amp);
    }

    canvasCtx.stroke();
  };

  const resetAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioSource(null);
    setIsPlaying(false);
    setPlaybackPosition(0);
    if (canvasRef.current) {
      const canvasCtx = canvasRef.current.getContext('2d');
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };

  const handleUpload = async () => {
    if (audioBlob) {
      setIsLoading(true);
      try {
        const file = new File([audioBlob], 'audio_expense.wav', { type: 'audio/wav' });
        const response = await uploadExpenseFile(file);
        // Response was succcessful 2xx
        onUploadComplete(response.data.expense);
      } catch (error) {
        console.error('Error al cargar el audio:', error);
        if (axios.isAxiosError(error)) {
          if (error.response) {
            // El servidor respondió con un status fuera del rango 2xx
            if (error.response.status === 422) {
              setErrorMessage("No se registró ningún gasto. El archivo se procesó correctamente, pero no se pudo identificar ningún gasto válido.");
            } else {
              setErrorMessage('Error en la respuesta del servidor: ' + error.response.data.message);
            }
          } else if (error.request) {
            // La petición fue hecha pero no se recibió respuesta
            setErrorMessage('No se recibió respuesta del servidor. Por favor, intenta de nuevo.');
          } else {
            // Algo sucedió al configurar la petición que provocó un Error
            setErrorMessage('Error al preparar la solicitud. Por favor, intenta de nuevo.');
          }
        } else {
          // Error no relacionado con Axios
          setErrorMessage('Ocurrió un error inesperado. Por favor, intenta de nuevo.');
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <Container>
      {isLoading && <LoadingOverlay message="Procesando audio..." />}
      <WaveformContainer isVisible={audioBlob !== null || isRecording}>
        <Waveform ref={canvasRef} width={800} height={100} />
        {audioBlob && <PlaybackPosition style={{ left: `${playbackPosition}px` }} />}
      </WaveformContainer>
      <StatusText>
        {isRecording ? 'Grabando...' : 
         audioSource === 'recorded' ? 'Audio grabado' : 
         audioSource === 'uploaded' ? 'Audio cargado' : 
         'Graba o carga un audio para registrar un gasto'}
      </StatusText>
      <ButtonContainer>
        {!audioBlob ? (
          <>
            <ActionButton onClick={isRecording ? stopRecording : startRecording} isActive={isRecording}>
              {isRecording ? <FaStop /> : <FaMicrophone />}
            </ActionButton>
            <FileInput
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              id="audioFileInput"
            />
            <FileButton htmlFor="audioFileInput">
              <FaUpload /> Subir audio
            </FileButton>
          </>
        ) : (
          <>
            <ActionButton onClick={togglePlayback}>
              {isPlaying ? <FaPause /> : <FaPlay />}
            </ActionButton>
            <ActionButton onClick={resetAudio}>
              <FaTrash />
            </ActionButton>
          </>
        )}
      </ButtonContainer>
      {audioBlob && (
        <SubmitButton onClick={handleUpload} disabled={isLoading}>
          Registrar gasto
        </SubmitButton>
      )}
      <audio 
        ref={audioRef}
        src={audioUrl || ''}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <ErrorModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        message={errorMessage || ''}
      />
    </Container>
  );
};

export default AudioRecorder;