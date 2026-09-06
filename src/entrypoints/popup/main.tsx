import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/ui/styles/tokens.css';
import '@/ui/styles/ui.css';
import { PopupApp } from './App';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <PopupApp />
    </React.StrictMode>,
  );
}
