import api from './api'

export const settingsService = {
  get: (userId) => api.get(`/api/settings?user_id=${userId}`),
  save: (userId, data) => api.put('/api/settings', { user_id: userId, ...data }),
}
export default settingsService
