import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import PaperMarkdownView from './components/PaperMarkdownView'


function App() {
  return (
    <Router>
      <div className='bg-gray-100'>
        <Header></Header>
        <Routes>
          <Route path="/" element={<PaperMarkdownView></PaperMarkdownView>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;