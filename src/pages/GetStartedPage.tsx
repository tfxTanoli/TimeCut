import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'

export default function GetStartedPage() {
  const { openSignup } = useAuthModal()
  const navigate = useNavigate()
  // The route exists only to open the signup modal and bounce back home, so it
  // must fire exactly once. The ref guard lets the dependency list stay honest
  // without the effect re-running when the context hands back a new callback.
  const opened = useRef(false)

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    openSignup()
    navigate('/', { replace: true })
  }, [openSignup, navigate])

  return null
}
