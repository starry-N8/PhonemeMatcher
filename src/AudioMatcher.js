// src/components/AudioMatcher.js
import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, StopCircle } from 'lucide-react';
import './AudioMatcher.css';

const WS_URL = 'wss://20.204.169.24:8000/ws/phoneme-match';
// const WS_URL = 'ws://localhost:8000/ws/phoneme-match';
const TARGET_RATE = 16000;
const CHUNK_DURATION_MS = 1000; // ms

function resampleBuffer(buffer, inputRate, outputRate) {
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const resampled = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const idx = i * ratio;
    const before = Math.floor(idx);
    const after = Math.min(Math.ceil(idx), buffer.length - 1);
    const atPoint = idx - before;
    resampled[i] = (1 - atPoint) * buffer[before] + atPoint * buffer[after];
  }
  return resampled;
}

export default function AudioMatcher({ expectedPhonemes }) {
  const [recording, setRecording] = useState(false);
  const [connected, setConnected] = useState(false);
  const [segments, setSegments] = useState([]);

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const bufferRef = useRef([]);
  const lastSendTimeRef = useRef(null);

  const start = async () => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ expected_phonemes: expectedPhonemes }));
    };
    ws.onmessage = evt => {
      const data = JSON.parse(evt.data);
      const hasResult = Array.isArray(data.matches) && data.matches.length > 0;
      if (hasResult) {
        const latency = lastSendTimeRef.current ? Date.now() - lastSendTimeRef.current : null;
        const newSeg = {
          predicted: (data.predicted_phonemes || []).join(' '),
          accuracy: data.weighted_accuracy,
          matches: data.matches || [],
          latency
        };
        setSegments(prev => [newSeg, ...prev]);
      }
    };
    ws.onclose = () => setConnected(false);
    wsRef.current = ws;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    source.connect(processor);
    processor.connect(audioCtx.destination);

    processor.onaudioprocess = e => {
      bufferRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      const bufferLen = bufferRef.current.reduce((sum, arr) => sum + arr.length, 0);
      const chunkSize = (audioCtx.sampleRate * CHUNK_DURATION_MS) / 1000;
      if (bufferLen >= chunkSize) {
        const chunk = new Float32Array(chunkSize);
        let offset = 0;
        while (offset < chunkSize) {
          const piece = bufferRef.current.shift();
          const copyLen = Math.min(piece.length, chunkSize - offset);
          chunk.set(piece.subarray(0, copyLen), offset);
          offset += copyLen;
          if (copyLen < piece.length) bufferRef.current.unshift(piece.subarray(copyLen));
        }
        const resampled = resampleBuffer(chunk, audioCtx.sampleRate, TARGET_RATE);
        lastSendTimeRef.current = Date.now();
        ws.send(resampled.buffer);
      }
    };

    setRecording(true);
  };

  const stop = () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();
    bufferRef.current = [];
    wsRef.current?.close();
    setRecording(false);
  };

  return (
    <div className="audio-matcher">
      <div className="buttons">
        <motion.button onClick={start} disabled={recording} className="start-btn">
          <Mic size={18} /> Start
        </motion.button>
        <motion.button onClick={stop} disabled={!recording} className="stop-btn">
          <StopCircle size={18} /> Stop
        </motion.button>
      </div>
      <div className="status">{connected ? 'Connected' : 'Disconnected'}</div>
      <div className="segments">
        {segments.map((seg, idx) => (
          <div key={idx} className="segment-card">
            <div className="seg-header">
              <span>Segment {segments.length - idx}</span>
              <span className="accuracy">{seg.accuracy != null ? seg.accuracy.toFixed(2) : '--'}</span>
              {seg.latency != null && (
                <span className="latency">{seg.latency} ms</span>
              )}
            </div>
            <div className="seg-body">
              <div className="predicted">Predicted: {seg.predicted}</div>
              <div className="matches">
                <strong>Matches:</strong>
                <ul>
                  {seg.matches.map((m, i) => (
                    <li key={i}>{m.expected} ↔ {m.predicted} | {m.match_score.toFixed(2)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
