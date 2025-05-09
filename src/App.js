import React, { useState } from 'react';
import AudioMatcher from './AudioMatcher';
import './App.css';

export default function App() {
  const [expected, setExpected] = useState('b ə n æ n ə');

  return (
    <div className="app-container">
      <div className="card">
        <h1>Phoneme Matcher</h1>
        <div className="input-group">
          <label>Expected Phonemes (space seperated)</label>
          <input
            type="text"
            value={expected}
            onChange={e => setExpected(e.target.value)}
          />
        </div>
        <AudioMatcher expectedPhonemes={expected.split(' ')} />
      </div>
    </div>
  );
}