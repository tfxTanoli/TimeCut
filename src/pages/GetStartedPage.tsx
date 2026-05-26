import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'

export default function GetStartedPage() {
  const { openSignup } = useAuthModal()
  const navigate = useNavigate()

  useEffect(() => {
    openSignup()
    navigate('/', { replace: true })
  }, [])

  return null
}
