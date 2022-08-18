import { autoPlacement, autoUpdate, useFloating } from '@floating-ui/react-dom'
import { MinusCircleIcon, PencilIcon } from '@heroicons/react/solid'
import animateScrollTo from 'animated-scroll-to'
import assert from 'assert'
import fuzzySort from 'fuzzysort'
import { atom, PrimitiveAtom, useAtom, useSetAtom } from 'jotai'
import { CSSProperties, Ref, useEffect, useMemo, useRef, useState } from 'react'
import { TailwindClassDescription, TailwindClasses } from './tailwind'
import { makeTransformers } from './transformers'

const classEditorTmpClass = '__impulse__class-editor-tmp-class'

export type ClassEditorState = ClassEditorStateActive | ClassEditorStateOff
export type ClassEditorStateActive = {
  type: 'active'
  inputValue: string
}
export type ClassEditorStateOff = {
  type: 'off'
}

export function useClassEditor() {
  const stateAtomRef = useRef(
    atom<ClassEditorState>({
      type: 'off',
    }),
  )

  const setState = useSetAtom(stateAtomRef.current)

  const toggle = () => {
    setState((state) => {
      if (state.type === 'off') {
        return {
          type: 'active',
          inputValue: '',
        }
      }

      return {
        type: 'off',
      }
    })
  }

  return {
    stateAtom: stateAtomRef.current,
    toggle,
  }
}

type ClassEditorProps = {
  selectedNode?: Node
  stateAtom: PrimitiveAtom<ClassEditorState>
  tailwindClasses: TailwindClasses
  transformers: ReturnType<typeof makeTransformers>
  rerender: () => void
}

export function ClassEditor(props: ClassEditorProps) {
  const [state] = useAtom(props.stateAtom)

  if (state.type === 'off') {
    return null
  }

  return <ClassEditorActive {...props} />
}

export function ClassEditorActive({
  selectedNode,
  stateAtom,
  tailwindClasses,
  transformers,
  rerender,
}: ClassEditorProps) {
  const [state, setState] = useAtom(stateAtom)
  assert(state.type === 'active')

  const floatingUi = useFloating({
    whileElementsMounted: autoUpdate,
    middleware: [autoPlacement()],
  })

  useEffect(() => {
    if (selectedNode instanceof HTMLElement) {
      floatingUi.reference(selectedNode)
      return
    }
  }, [selectedNode])

  useEffect(() => {
    if (!(selectedNode instanceof HTMLElement)) {
      return
    }

    if (selectedNode.classList.contains(classEditorTmpClass)) {
      return
    }

    selectedNode.classList.add(classEditorTmpClass)

    return () => selectedNode.classList.remove(classEditorTmpClass)
  }, [state])

  const inputRef = useRef<HTMLInputElement>(null)

  const closeClassEditor = () => {
    setState({
      type: 'off',
    })
  }

  useEffect(() => {
    if (!inputRef.current) {
      return
    }

    inputRef.current.focus({ preventScroll: true })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeClassEditor()
      }
    }

    inputRef.current.addEventListener('keydown', onKeyDown)
    // inputRef.current.addEventListener('blur', onBlur)

    return () => {
      inputRef.current?.removeEventListener('keydown', onKeyDown)
      // inputRef.current?.removeEventListener('blur', onBlur)
    }
  }, [inputRef.current])

  const tailwindClassesArray = useMemo(
    () => Object.keys(tailwindClasses),
    [tailwindClasses],
  )

  const existingClasses =
    selectedNode instanceof HTMLElement
      ? [...selectedNode.classList].filter(
          (className) => !className.startsWith('__impulse__'),
        )
      : []

  const fuzzyMatches = useMemo(() => {
    return fuzzySort.go(
      state.inputValue,
      Object.entries(tailwindClasses).map(([className, props]) => ({
        fullSearchString: `${className} ${props.nodes
          .map(({ prop, value }) => `${prop} ${value}`)
          .join(' ')}`,
        className,
        props,
      })),
      {
        keys: ['className', 'fullSearchString'],
        limit: 50,
        threshold: -50000,
      },
    )
  }, [state.inputValue])

  const tailwindClassCandidates =
    state.inputValue === ''
      ? existingClasses
      : [...fuzzyMatches]
          .sort((a, b) => {
            const indexDifference =
              tailwindClassesArray.indexOf(b.obj.className) -
              tailwindClassesArray.indexOf(a.obj.className)

            const scoreDifference = Math.abs(
              Math.abs(a.score) - Math.abs(b.score),
            )
            const scoreDifferenceCoof =
              Math.abs(scoreDifference) /
              Math.max(Math.abs(a.score), Math.abs(b.score))

            // if the difference between the two options is not that big, choose based on which is listed the first
            // in the list of all tailwind classes
            // TODO: lookup the value of css props they change and sort according to the values
            if (scoreDifferenceCoof < 0.25) {
              return indexDifference * -1
            }

            return b.score - a.score
          })
          .map((m) => m.obj.className)

  type ListSelectionState = {
    selectedKey: string | null
  }
  const [listSelectionState, setListSelectionState] =
    useState<ListSelectionState>({
      selectedKey: null,
    })

  const tailwindClassMatched =
    tailwindClasses[listSelectionState.selectedKey ?? '']

  const classesToReplace = useMemo(() => {
    if (!tailwindClassMatched) {
      return []
    }

    const matchedClassEditProps = tailwindClassMatched.nodes
      .map(({ prop }) => prop)
      .sort()
      .join(' ')

    return existingClasses.filter((existingClassName) => {
      const existingClass = tailwindClasses[existingClassName]
      if (!existingClass) {
        return false
      }

      const existingClassEditsProps = existingClass.nodes
        .map(({ prop }) => prop)
        .sort()
        .join(' ')

      return existingClassEditsProps === matchedClassEditProps
    })
  }, [tailwindClassMatched, existingClasses])

  // reset selection to the first item each time the input value changes
  useEffect(() => {
    const selectedKey =
      tailwindClassCandidates.length > 0 ? tailwindClassCandidates[0] : null

    setListSelectionState({
      selectedKey,
    })
  }, [state.inputValue])

  const onClassSelected = async (className: string) => {
    if (!(selectedNode instanceof Element)) {
      return
    }

    if (existingClasses.includes(className)) {
      await transformers.removeClass(selectedNode, className)
    } else {
      await transformers.addClass(selectedNode, className, classesToReplace)
    }

    setState({
      type: 'active',
      inputValue: '',
    })
  }

  useEffect(() => {
    if (!inputRef.current) {
      return
    }

    const onKeyDown = async (e: KeyboardEvent) => {
      const selectedKey = listSelectionState.selectedKey
      if (!selectedKey) {
        return
      }

      if (e.code === 'ArrowUp') {
        e.preventDefault()
        const index = tailwindClassCandidates.indexOf(selectedKey)
        const prevIndex = index - 1
        const prevItem =
          tailwindClassCandidates[prevIndex] ??
          tailwindClassCandidates[tailwindClassCandidates.length - 1]
        setListSelectionState({
          selectedKey: prevItem,
        })
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const index = tailwindClassCandidates.indexOf(selectedKey)
        const nextIndex = index + 1
        const nextItem =
          tailwindClassCandidates[nextIndex] ?? tailwindClassCandidates[0]
        setListSelectionState({
          selectedKey: nextItem,
        })
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        await onClassSelected(selectedKey)
      }
    }

    inputRef.current.addEventListener('keydown', onKeyDown)

    return () => {
      inputRef.current?.removeEventListener('keydown', onKeyDown)
    }
  }, [inputRef.current, listSelectionState, classesToReplace])

  const listContainerRef = useRef<HTMLDivElement>(null)
  const listSelectedElementRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!listSelectedElementRef.current || !listContainerRef.current) {
      return
    }

    const containerRect = listContainerRef.current.getBoundingClientRect()
    const selectedRect = listSelectedElementRef.current.getBoundingClientRect()

    if (
      selectedRect.top < containerRect.top ||
      selectedRect.bottom > containerRect.bottom
    ) {
      animateScrollTo(listSelectedElementRef.current, {
        elementToScroll: listContainerRef.current,
      })
    }
  }, [
    listContainerRef.current,
    listSelectedElementRef.current,
    listSelectionState.selectedKey,
  ])

  useEffect(() => {
    floatingUi.update()
  }, [tailwindClassMatched])

  useEffect(() => {
    rerender()
  }, [listSelectionState])

  return (
    <ClassEditorView
      refs={{
        input: inputRef,
        listContainer: listContainerRef,
        listSelectedElement: listSelectedElementRef,
        floating: floatingUi.floating,
      }}
      style={{
        position: floatingUi.strategy ?? 'absolute',
        top: floatingUi.y ?? 0,
        left: floatingUi.x ?? 0,
      }}
      inputValue={state.inputValue}
      inputOnChange={(value) => {
        setState((state) => {
          return {
            ...state,
            inputValue: value,
          }
        })
      }}
      selectedKey={listSelectionState.selectedKey}
      onItemClick={(className) => {
        const selectedKey = listSelectionState.selectedKey
        if (!selectedKey || !(selectedNode instanceof Element)) {
          return
        }
        onClassSelected(className)
      }}
      {...{
        tailwindClasses,
        tailwindClassMatched,
        tailwindClassCandidates,
        existingClasses,
        classesToReplace,
      }}
    />
  )
}

export function ClassEditorView(props: {
  refs: {
    floating: (node: HTMLElement | null) => void
    input: Ref<HTMLInputElement>
    listContainer: Ref<HTMLDivElement>
    listSelectedElement: Ref<HTMLButtonElement>
  }
  style?: CSSProperties
  tailwindClassMatched?: TailwindClassDescription
  inputValue: string
  inputOnChange: (value: string) => void
  tailwindClassCandidates: string[]
  tailwindClasses: { [key: string]: TailwindClassDescription }
  selectedKey: string | null
  onItemClick: (className: string) => void
  existingClasses: string[]
  classesToReplace: string[]
}) {
  return (
    <div
      ref={props.refs.floating}
      className="bg-theme-bg text-base shadow-lg border border-theme-bg"
      style={{
        width: 400,
        ...props.style,
      }}
    >
      {props.tailwindClassMatched && (
        <style>{`.${classEditorTmpClass} {${props.tailwindClassMatched.nodes
          .map((node) => {
            return `${node.prop}: ${node.value};`
          })
          .join('')}}`}</style>
      )}
      <div className="p-2">
        <input
          ref={props.refs.input}
          className="w-full bg-theme-bg-highlight border border-theme-accent outline-none px-1 py-px selection:bg-theme-accent/50"
          type="text"
          placeholder="Search for a class..."
          value={props.inputValue}
          onChange={(event) => {
            props.inputOnChange(event.target.value)
          }}
        />
      </div>
      <div
        ref={props.refs.listContainer}
        className="h-[200px] overflow-y-auto font-mono"
      >
        {props.tailwindClassCandidates.map((className) => {
          const isSelected = props.selectedKey === className

          return (
            <button
              type="button"
              ref={isSelected ? props.refs.listSelectedElement : undefined}
              key={className}
              className={`flex items-start ${
                isSelected ? 'bg-theme-accent/75' : 'hover:bg-theme-accent/25'
              } w-full text-left px-2 overflow-x-hidden`}
              onClick={async () => {
                props.onItemClick(className)
              }}
            >
              <div className="w-6 flex-none mt-[2px]">
                {(() => {
                  if (props.existingClasses.includes(className)) {
                    return <MinusCircleIcon className="w-5" />
                  }

                  if (isSelected && props.classesToReplace.length > 0) {
                    return <PencilIcon className="w-5" />
                  }

                  const classDescription = props.tailwindClasses?.[className]
                  const possibleColorProps = [
                    'accent-color',
                    'caret-color',
                    'color',
                    'column-rule-color',
                    'background-color',
                    'border-color',
                    'border-top-color',
                    'border-right-color',
                    'border-bottom-color',
                    'border-left-color',
                    'fill',
                    'outline-color',
                    'stop-color',
                    'stroke',
                    'text-decoration-color',
                  ]
                  const colorProp = classDescription?.nodes.find((node) =>
                    possibleColorProps.includes(node.prop),
                  )

                  if (colorProp) {
                    return (
                      <div
                        className="w-5 h-5"
                        style={{ backgroundColor: colorProp.value }}
                      ></div>
                    )
                  }

                  return <TailwindIcon />
                })()}
              </div>
              <span className="shrink-0">
                {(() => {
                  if (props.existingClasses.includes(className)) {
                    return `${className} (remove)`
                  }
                  if (isSelected && props.classesToReplace.length > 0) {
                    return `${className} (instead of ${props.classesToReplace.join(
                      ' ',
                    )})`
                  }
                  return className
                })()}
              </span>
              {isSelected && props.tailwindClassMatched && (
                <div className="basis-0 whitespace-nowrap ml-2 text-sm self-center text-theme-content-opaque">
                  {props.tailwindClassMatched.nodes
                    .map(({ prop, value }) => `${prop}: ${value};`)
                    .join(' ')}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TailwindIcon() {
  return (
    <svg viewBox="0 0 248 31" className="w-auto h-3 mt-[4px]">
      <path
        className="fill-theme-blue"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M25.517 0C18.712 0 14.46 3.382 12.758 10.146c2.552-3.382 5.529-4.65 8.931-3.805 1.941.482 3.329 1.882 4.864 3.432 2.502 2.524 5.398 5.445 11.722 5.445 6.804 0 11.057-3.382 12.758-10.145-2.551 3.382-5.528 4.65-8.93 3.804-1.942-.482-3.33-1.882-4.865-3.431C34.736 2.92 31.841 0 25.517 0zM12.758 15.218C5.954 15.218 1.701 18.6 0 25.364c2.552-3.382 5.529-4.65 8.93-3.805 1.942.482 3.33 1.882 4.865 3.432 2.502 2.524 5.397 5.445 11.722 5.445 6.804 0 11.057-3.381 12.758-10.145-2.552 3.382-5.529 4.65-8.931 3.805-1.941-.483-3.329-1.883-4.864-3.432-2.502-2.524-5.398-5.446-11.722-5.446z"
      ></path>
    </svg>
  )
}
