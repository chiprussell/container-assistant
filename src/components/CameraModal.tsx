import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Container } from '../types';
import { XCircleIcon } from './Icons';

interface CameraModalProps {
  containers: Container[];
  onClose: () => void;
  onScan: (base64Image: string, containerId: number) => void;
  isScanning: boolean;
}

export const CameraModal: React.FC<CameraModalProps> = ({ containers, onClose, onScan, isScanning }) => {
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(containers.length > 0 ? containers[0].id : null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access the camera. Please check permissions.");
    }
  }, []);
  
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera]);

  const handleCapture = () => {
    if (videoRef.current && selectedContainerId !== null) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
        onScan(base64Image, selectedContainerId);
      }
    } else if (selectedContainerId === null) {
        setError("Please select a container first.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg relative text-white border border-gray-700">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
          <XCircleIcon className="w-8 h-8" />
        </button>
        <h2 className="text-2xl font-bold mb-4 text-center">Scan Container Contents</h2>
        {error && <p className="text-red-400 text-center mb-4">{error}</p>}
        
        <div className="mb-4">
          <label htmlFor="container-select" className="block text-sm font-medium text-gray-300 mb-2">Select Container to Update:</label>
          <select
            id="container-select"
            value={selectedContainerId ?? ''}
            onChange={(e) => setSelectedContainerId(Number(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            disabled={containers.length === 0}
          >
            {containers.length > 0 ? (
                containers.map(container => <option key={container.id} value={container.id}>Container #{container.id}</option>)
            ) : (
                <option>No containers available. Create one first.</option>
            )}
          </select>
        </div>

        <div className="bg-black rounded-lg overflow-hidden w-full aspect-video mb-4 border border-gray-700">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
        </div>

        <button
          onClick={handleCapture}
          disabled={isScanning || containers.length === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center text-lg"
        >
          {isScanning ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Scanning...
            </>
          ) : "Scan & Update Container"}
        </button>
      </div>
    </div>
  );
};