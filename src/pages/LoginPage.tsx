import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'

export default function LoginPage() {
  const { openLogin } = useAuthModal()
  const navigate = useNavigate()
  // Fires exactly once — see the same guard in GetStartedPage. The ref keeps the
  // dependency list complete without re-opening the modal on every re-render.
  const opened = useRef(false)

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    openLogin()
    navigate('/', { replace: true })
  }, [openLogin, navigate])

  return null
}
