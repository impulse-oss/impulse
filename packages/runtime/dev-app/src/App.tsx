import { useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { SwipRoot } from '../../src/app';
import '../../dist/index.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <SwipRoot />
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        
        <p>
          <button type="button" onClick={() => setCount((count) => count + 1)}>
            count is: {count}
          </button>
        </p>
        <p>
          Edit  and save to test HMR updates.
        </p>
        


















      </header>
    </div>);

}

export default App;