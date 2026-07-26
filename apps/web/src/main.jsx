import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { captureReferralFromUrl } from './lib/referral.js';
import './index.css';

/**
 * Runs before the first render, and before the router has a chance to rewrite
 * the URL. An invite code arrives as `/?ref=CODE`, and React Router's initial
 * navigation would otherwise drop the query string before anything could read it.
 */
captureReferralFromUrl();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
