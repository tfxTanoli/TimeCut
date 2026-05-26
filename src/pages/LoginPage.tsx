import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'

export default function LoginPage() {
  const { openLogin } = useAuthModal()
  const navigate = useNavigate()

  useEffect(() => {
    openLogin()
    navigate('/', { replace: true })
  }, [])

  return null
}
