import { useState } from 'react'
import './App.css'
import Query from "./component/Query"

function App() {
  

  return (
    <>
      <div className="container my-5 text-dark">
        <div className="brand-header text-center">
          <h1 className="brand-title">KanJutsu</h1>
          <div className="brand-divider"></div>
          <p className="brand-subtitle">Kanji dictionary lookup</p>
        </div>

        <div className="container my-5 text-dark">
          <Query />
        </div>
      </div>
    </>
  )
}

export default App;