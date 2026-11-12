import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import './index.css';
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '14px', fontSize: '13px', fontWeight: 600 },
            success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
            error: { iconTheme: { primary: '#e11d48', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
