import { params } from '@nanostores/i18n'

import { i18n } from '#vue/i18n/create'

export const updatesMessageDefaults = {
  upToDate: 'Zenuxs Desigen is up to date',
  availableTitle: 'Update Zenuxs Desigen',
  available: params('Zenuxs Desigen {version} is available.'),
  installPrompt: 'Download and install it now? The app will restart after the update is installed.',
  downloading: params('Downloading Zenuxs Desigen {version}'),
  installedTitle: 'Update installed',
  installed: params('Zenuxs Desigen {version} was installed{size}. Restarting now.'),
  unavailable: 'Updates are not available yet. Publish a signed release with latest.json first.',
  checkFailed: params('Could not check for updates: {error}')
} as const

export const updatesMessages = i18n('updates', updatesMessageDefaults)
