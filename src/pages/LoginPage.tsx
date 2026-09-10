import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'

export default function LoginPage() {
  const { openLogin } = useAuthModal()
  const navigate = useNavigate()
  const location = useLocation()
  // Fires exactly once — see the same guard in GetStartedPage. The ref keeps the
  // dependency list complete without re-opening the modal on every re-render.
  const opened = useRef(false)

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    openLogin()

    // Same bounce rule as GetStartedPage. This was hardcoded to '/', so opening
    // Login from anywhere — the navbar on any page, the footer — moved the
    // visitor to the home hero first, and closing the modal left them there
    // rather than on the page they were reading. GetStartedPage was fixed for
    // signup and this was left behind, so half the complaint survived.
    //
    // React Router marks the session's first history entry with the key
    // 'default'; any other key means the visitor arrived from another page in
    // the app and can be stepped back to it.
    if (location.key !== 'default') navigate(-1)
    else navigate('/', { replace: true })
  }, [openLogin, navigate, location.key])

  return null
}
