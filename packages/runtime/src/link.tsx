export function Link(
  props: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>,
) {
  return (
    <a {...props} className={`${props.className ?? ''} underline hover:text-theme-content-opaque`}>
      {props.children}
    </a>
  )
}
