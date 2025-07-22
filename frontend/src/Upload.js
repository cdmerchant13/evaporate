import React, { useState } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import './index.css';

function Upload() {
  const [file, setFile] = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [expiry, setExpiry] = useState('1d');
  const [oneTimeView, setOneTimeView] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadUrl, setUploadUrl] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError('');
    setUploadUrl('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('passphrase', passphrase);
    formData.append('expiry', oneTimeView ? 'one-time' : expiry);
    formData.append('oneTimeView', oneTimeView);

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }
      
      setUploadUrl(result.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container">
      <header className="App-header">
        <h1>Evaporate</h1>
        <p>Share files that disappear.</p>
      </header>
      <main>
        {!uploadUrl ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="file">File</label>
              <input type="file" id="file" onChange={handleFileChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="passphrase">Passphrase (optional)</label>
              <input
                type="password"
                id="passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={oneTimeView}
                  onChange={(e) => setOneTimeView(e.target.checked)}
                />
                Expire after one view
              </label>
            </div>
            {!oneTimeView && (
               <div className="form-group">
               <label htmlFor="expiry">Expires in</label>
               <select id="expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                 <option value="1h">1 Hour</option>
                 <option value="1d">1 Day</option>
                 <option value="7d">7 Days</option>
               </select>
             </div>
            )}
            <button type="submit" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </form>
        ) : (
          <div className="success-message">
            <h2>Upload Successful!</h2>
            <p>Your file is available at:</p>
            <a href={uploadUrl} target="_blank" rel="noopener noreferrer">
              {uploadUrl}
            </a>
            <div className="qr-code">
              <QRCode value={uploadUrl} />
            </div>
          </div>
        )}
        {error && <p className="error-message">{error}</p>}
      </main>
    </div>
  );
}

export default Upload;
