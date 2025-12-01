// test-component.js
import React from 'react';
import { DJAMMSPlayer } from './dist/index.js';

function TestApp() {
  return React.createElement('div', null,
    React.createElement('h1', null, 'DJAMMS Player Test'),
    React.createElement(DJAMMSPlayer, {
      width: 800,
      height: 600,
      showControls: true,
      showProgress: true,
      showNowPlaying: true
    })
  );
}

console.log('DJAMMS Player component imported successfully!');
console.log('Test component created:', typeof TestApp);

export default TestApp;