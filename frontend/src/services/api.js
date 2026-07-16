import axios from 'axios'

export const STORAGE_KEY = 'coldblock_access_token'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export async function login(password) {
  const response = await client.post('/auth/login', { password })
  return response.data.access_token
}

export async function getDashboardSummary() {
  const response = await client.get('/dashboard/summary')
  return response.data
}

export default client
