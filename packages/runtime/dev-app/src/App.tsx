import { Fragment, PropsWithChildren, useState } from 'react'
import logo from './logo.svg'
import vscodeScreenshot from './vscode-cmdp.png'
import { ImpulseRoot } from '../../src/app'
import { Alert } from '@mui/material'
import { RedText } from './red-text'
import headerImgUrl from '../header.png'
import vegIconUrl from '../veg.png'
import { ClassEditorView } from '../../src/class-editor'

// @ts-ignore
import tailwindConfig from 'tailwind.config.js'

// if (process.env.NODE_ENV === "development") {
//   import("../../dist/impulse.es.mjs").then((impulse) => impulse.run());
// }

function App() {
  return (
    <div className="App">
      <ImpulseRoot
        prettierConfig={{
          semi: false,
          trailingComma: 'all',
          singleQuote: true,
          printWidth: 80,
          tabWidth: 2,
        }}
        tailwindConfig={tailwindConfig}
      />

      {/* <RestaurantPage /> */}
      <ClassEditorPlayground />
      {/* <Playground /> */}
    </div>
  )
}

function Playground() {
  const [count, setCount] = useState(0)
  return (
    <header className="grid grid-cols-2 gap-4 p-8">
      <Section title="Image">
        <img src={logo} alt="logo" className="w-40" />
        <div>second element</div>
      </Section>
      <Section title="Counter">
        <p>
          <button type="button" onClick={() => setCount((count) => count + 1)}>
            count is: {count}
          </button>
          {' FIXME '}
          {Math.random() > 0.5 ? <>conditional1</> : <>{'conditional' + 2}</>}
        </p>
      </Section>
      <Section title="Loop + Fragment + Text/span">
        {new Array(2).fill(0).map((_, i) => (
          <Fragment key={i}>
            FIXME: move Hello Vite + <span>React!</span>
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
            className="underline"
          >
            Learn React
          </a>

          {' | '}
          <a
            href="https://vitejs.dev/guide/features.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Vite Docs
          </a>
        </p>
      </Section>
      I'm just a text
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
      <Section title="Div + Component on the same level">
        <LargeText />
        <div>div text</div>
      </Section>
      <Section title="Imported component">
        <RedText>Foobar FIXME jump to code</RedText>
      </Section>
    </header>
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
      element 2<div>element 3</div>
    </>
  )
}

function LargeText() {
  return <span className="text-xl">some text</span>
}

function RestaurantPage() {
  return (
    <div className="bg-[#e5e5e5]">
      <div className="w-[375px] mx-auto min-h-screen bg-white">
        <div
          className="h-40 p-5"
          style={{ backgroundImage: `url(${headerImgUrl})` }}
        >
          <div className="h-10 w-10 bg-white rounded-full flex justify-center items-center">
            <div className="w-1/2 flex flex-col justify-between h-[38%]">
              <div className="border border-black rounded-full"></div>
              <div className="border border-black rounded-full"></div>
              <div className="border border-black rounded-full"></div>
            </div>
          </div>
        </div>
        <h1 className="text-yellow-700">ChaCha</h1>
        <div className="py-4 px-5 bg-[#CCFFCB]">
          <div className="text-lg font-medium">
            Do you have food preferences?
          </div>
          <div className="flex gap-4 mt-2">
            <div className="text-center">
              <div>
                <div className="w-[72px] h-[72px] border-[#AFAFAF] rounded-full border-4 flex p-2">
                  <img src={vegIconUrl} alt="vegeterian icon" />
                </div>
              </div>
              <span className="text-sm">Vegetarian</span>
            </div>
            <div className="leading-tight">
              Specify what you like or are allergic to, and we'll narrow down
              the menu to the ones that suit you best
            </div>
          </div>
          <button className="mt-2 w-full text-white py-3 text-lg font-bold rounded-lg bg-green-700">
            Adapt the Menu
          </button>
        </div>
        <div className="mt-6 h-12 bg-[#dadada] flex px-5 pt-2">
          <div className="grow shrink-0 basis-0 flex justify-center items-center">
            OnSiteOrder
          </div>
          <div className="bg-white rounded-t-lg grow shrink-0 basis-0 text-center flex justify-center items-center">
            Delivery
          </div>
        </div>
      </div>
    </div>
  )
}

function ClassEditorPlayground() {
  return (
    <div className="flex">
      <div className="m-8 theme-solarized-light">
        <ClassEditorView
          refs={{
            floating: () => {},
            listContainer: () => {},
            listSelectedElement: () => {},
            input: () => {},
          }}
          style={{}}
          tailwindClassMatched={undefined}
          inputValue="foo"
          inputOnChange={() => {}}
          tailwindClassCandidates={[
            'class-1',
            'class-2',
            'class-3',
            'class-4',
            'class-5',
            'class-6',
            'class-7-very-long-name-that-spans-two-lines',
            'class-8',
            'class-9',
            'class-10',
          ]}
          selectedKey={'class-2'}
          onItemClick={() => {}}
          existingClasses={['class-6']}
          classesToReplace={['class-6']}
          tailwindClasses={{
            'class-4': {
              nodes: [
                {
                  prop: 'color',
                  value: 'red',
                },
              ],
            },
          }}
        />
      </div>
      <img
        className="max-w-[600px] object-contain"
        src={vscodeScreenshot}
        alt="logo"
      />
    </div>
  )
}

export default App
