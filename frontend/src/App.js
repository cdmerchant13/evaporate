import React from 'react';
import Upload from './Upload';
import Download from './Download';

const App = () => {
  const path = window.location.pathname;
  if (path.startsWith('/file/')) {
    const fileId = path.split('/')[2];
    return <Download fileId={fileId} />;
  }
  return <Upload />;
};

export default App;
