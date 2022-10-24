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
import { NavTreePanelView } from '../../src/nav-tree'

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
          printWidth: 110,
          tabWidth: 2,
        }}
        tailwindConfig={tailwindConfig}
        config={{ editorLinkSchema: 'vscode', panel: { height: 350 } }}
      />

      {/* <Playground /> */}
      {/* <RestaurantPage /> */}
      {/* <ClassEditorPlayground /> */}
      <NavTreePlayground />
    </div>
  )
}

function Playground() {
  const [count, setCount] = useState(0)
  return (
    <header className="p-8 grid grid-cols-2 gap-4">
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
          <a href="https://reactjs.org" target="_blank" rel="noopener noreferrer" className="underline">
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
        <Alert severity="warning">This is a warning alert — check it out!</Alert>
      </Section>
      <Section title="a ? b : c">{1 === 1 + 1 ? <div>true</div> : <div>false</div>}</Section>
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
        <div className="h-40 p-5" style={{ backgroundImage: `url(${headerImgUrl})` }}>
          <div className="flex items-center justify-center w-10 h-10 bg-white rounded-full">
            <div className="w-1/2 flex flex-col justify-between h-[38%]">
              <div className="border border-black rounded-full"></div>
              <div className="border border-black rounded-full"></div>
              <div className="border border-black rounded-full"></div>
            </div>
          </div>
        </div>
        <h1 className="text-accent-700">ChaCha</h1>
        <div className="py-4 px-5 bg-[#CCFFCB]">
          <div className="text-lg font-medium">Do you have food preferences?</div>
          <div className="flex mt-2 gap-4">
            <div className="text-center">
              <div>
                <div className="w-[72px] h-[72px] border-[#AFAFAF] rounded-full border-4 flex p-2">
                  <img src={vegIconUrl} alt="vegeterian icon" />
                </div>
              </div>
              <span className="text-sm">Vegetarian</span>
            </div>
            <div className="leading-tight">
              Specify what you like or are allergic to, and we'll narrow down the menu to the ones that suit
              you best
            </div>
          </div>
          <button className="w-full py-3 mt-2 text-lg font-bold text-white bg-green-700 rounded-lg">
            Adapt the Menu
          </button>
        </div>
        <div className="mt-6 h-12 bg-[#dadada] flex px-5 pt-2">
          <div className="flex items-center justify-center grow shrink-0 basis-0">OnSiteOrder</div>
          <div className="flex items-center justify-center text-center bg-white rounded-t-lg grow shrink-0 basis-0">
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
        <FakeClassEditorView />
      </div>
      <img className="max-w-[600px] object-contain" src={vscodeScreenshot} alt="logo" />
    </div>
  )
}

function FakeClassEditorView(props: { selectedNode?: Node }) {
  return (
    <ClassEditorView
      refs={{
        listContainer: () => {},
        listSelectedElement: () => {},
        input: () => {},
      }}
      selectedNode={props.selectedNode}
      style={{}}
      tailwindClassMatched={undefined}
      classEditorState={{ type: 'active', inputValue: '', inputFocused: true }}
      inputOnChange={() => {}}
      inputOnFocus={() => {}}
      inputOnBlur={() => {}}
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
  )
}

function NavTreePlayground() {
  const [ref, setRef] = useState<HTMLDivElement | null>(null)

  return (
    <div ref={setRef} className="flex justify-center">
      <div className="w-2/3 m-8 font-sans text-base theme-solarized-light text-theme-content">
        {ref && (
          <NavTreePanelView
            height={350}
            rootRef={() => {}}
            selectedNode={ref}
            onNodeClick={() => {}}
            onCloseClick={() => {}}
            sidePanel={<FakeClassEditorView selectedNode={ref} />}
          />
        )}
      </div>
    </div>
  )
}

export default App
