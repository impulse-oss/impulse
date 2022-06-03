import { Fragment, PropsWithChildren, useState } from 'react'
import logo from './logo.svg'
import { ImpulseRoot } from '../../src/app'
import '../../dist/style.css'
import { Alert } from '@mui/material'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <ImpulseRoot />
      <header className="grid grid-cols-2 gap-4 p-8">
        <Section title="Image">
          <img src={logo} alt="logo" className="w-40" />
          <div>second element</div>
        </Section>
        <Section title="Counter">
          <p>
            <button
              type="button"
              onClick={() => setCount((count) => count + 1)}
            >
              count is: {count}
            </button>
            {' FIXME '}
            {Math.random() > 0.5 ? <>conditional1</> : <>{'conditional' + 2}</>}
          </p>
        </Section>
        <Section title="Loop + Fragment + Text/span">
          {new Array(2).fill(0).map((_, i) => (
            <Fragment key={i}>
              Hello Vite + <span>React!</span>
              <br />
            </Fragment>
          ))}
        </Section>
        <Section title="Loop + div">
          {new Array(2).fill(0).map((_, i) => (
            <div key={i}>Hello Vite + React!</div>
          ))}
        </Section>
        <Section title="Fragment + Text">
          <>
            <div className="very-long-list very-long-list1 very-long-list2 very-long-list3 very-long-list4 very-long-list5 very-long-list6 very-long-list7 very-long-list8">
              Fragment element 1
            </div>
            Fragment element 2 (text)
            <div>Fragment element 3</div>
          </>
        </Section>
        <Section title="">
          <p>
            Edit <code>App.tsx</code> and save to test HMR updates.
          </p>
        </Section>
        <Section title="Links">
          <p>
            <a
              href="https://reactjs.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn React
            </a>

            {' | '}
            <a
              href="https://vitejs.dev/guide/features.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vite Docs
            </a>
          </p>
        </Section>
        I'm just a text FIXME
        <br />
        {['text', 'generated', 'from', 'join'].join('\n')}
        <span>Single text child in a span</span>
        <Section title="">Single text child in a Section</Section>
        <Section title="">{'Single expression a Section'}</Section>
        <Section title="Component returning fragment">
          <ComponentFragment />
        </Section>
        <Section title="MUI alert">
          <Alert severity="warning">
            This is a warning alert — check it out!
          </Alert>
        </Section>
        <Section title="a ? b : c">
          {1 === 1 + 1 ? <div>true</div> : <div>false</div>}
        </Section>
        <Section title="FIXME Two expressions with space in between">
          <div>
            {'expression1'} {'expression2'}
          </div>
        </Section>
      </header>
    </div>
  )
}
function Section(props: PropsWithChildren<{ title: string }>) {
  return (
    <div>
      <h2 className="text-3xl">{props.title}</h2>
      <div>{props.children}</div>
      <hr />
    </div>
  )
}

function ComponentFragment() {
  return (
    <>
      <div>element 1</div>
      element 2 <div>element 3</div>
    </>
  )
}

export default App
