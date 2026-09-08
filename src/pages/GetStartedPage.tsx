import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'

export default function GetStartedPage() {
  const { openSignup } = useAuthModal()
  const navigate = useNavigate()
  const location = useLocation()
  // The route exists only to open the signup modal and bounce back, so it must
  // fire exactly once. The ref guard lets the dependency list stay honest
  // without the effect re-running when the context hands back a new callback.
  const opened = useRef(false)

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    openSignup()

    // Where to bounce to. This used to be hardcoded to '/', which meant every
    // route into signup — the Pricing Free card, the Pricing CTAs, the footer
    // link on any page — silently moved the visitor to the home hero first.
    // Closing the modal then left them somewhere they had never asked to be,
    // which reads as the X button throwing them back to the front page.
    //
    // React Router marks the session's first history entry with the key
    // 'default'. Any other key means the visitor reached this route from
    // another page in the app, so stepping back returns them to the page they
    // were actually reading. A direct or external hit has nowhere to step back
    // to and still lands on home.
    if (location.key !== 'default') navigate(-1)
    else navigate('/', { replace: true })
  }, [openSignup, navigate, location.key])

  return null
}
