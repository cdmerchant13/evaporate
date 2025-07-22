import React, { useState, useEffect } from 'react';
import './index.css';

const Download = ({ fileId }) => {
  const [fileInfo, setFileInfo] = useState(null);
  const [error, setError] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch(`/file/${fileId}`, {
          headers: {
            'Accept': 'application/json'
          }
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch file metadata');
        }
        setFileInfo(data);
      } catch (err) {
        setError(err.message);
      }
    };
    fetchMetadata();
  }, [fileId]);

  const handleDownload = async (e) => {
    e.preventDefault();
    setIsVerifying(true);
    setError('');

    try {
      const response = await fetch(`/file/${fileId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ passphrase }),
      });

      if (response.status === 401 || response.status === 403) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid passphrase');
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not download file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileInfo?.name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();

    } catch (err) {
      setError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  if (error) {
    return <div className="container error-message">{error}</div>;
  }

  if (!fileInfo) {
    return <div className="container">Loading...</div>;
  }

  if (!fileInfo.requiresPassphrase) {
    window.location.href = `/file/${fileId}`;
    return <div className="container">Redirecting to download...</div>;
  }

  return (
    <div className="container">
      <header className="App-header">
        <h1>Download File</h1>
      </header>
      <main>
        <p>This file is protected by a passphrase.</p>
        <p><strong>File:</strong> {fileInfo.name}</p>
        <p><strong>Size:</strong> {(fileInfo.size / 1024 / 1024).toFixed(2)} MB</p>
        <form onSubmit={handleDownload}>
          <div className="form-group">
            <label htmlFor="passphrase">Passphrase</label>
            <input
              type="password"
              id="passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={isVerifying}>
            {isVerifying ? 'Verifying...' : 'Download'}
          </button>
        </form>
      </main>
    </div>
  );
};

export default Download;
