import { Component } from 'react';
import { resetApp } from '../lib/pwa.js';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('NovaChat crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <img src="/icons/icon-192.png" alt="" width="72" height="72" />
        <h2>Something went wrong</h2>
        <p>{String(this.state.error?.message || this.state.error)}</p>
        <div className="crash-actions">
          <button className="pri" onClick={() => location.reload()}>Reload</button>
          <button onClick={resetApp}>Reset app files</button>
        </div>
        <small>Your chats are stored on this device and are not deleted by either action.</small>
      </div>
    );
  }
}
