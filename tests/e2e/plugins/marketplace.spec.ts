import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'

const editor = useEditorSetup('/editor')

test('plugin marketplace runs the bundled WASM self-test and explains unavailable entries', async () => {
  const page = editor.page
  await page.getByTestId('rail-plugins-tab').click()

  const dialog = page.getByRole('dialog', { name: 'Plugins & Extensions' })
  await expect(dialog).toBeVisible()

  // The self-test is installed by default and ships a real module: Run must go
  // through the sandbox and report the module's log and output.
  const selfTest = dialog.getByTestId('plugin-installed-sandbox-self-test')
  await expect(selfTest).toContainText('WASM Sandbox Self-Test')
  await selfTest.getByRole('button', { name: 'Run' }).click()

  const result = dialog.getByTestId('plugin-run-result')
  await expect(result).toBeVisible()
  await expect(result).toContainText('hello')
  await expect(result).toContainText('{"ok":true}')

  // A catalog-only entry installs, but its Run button stays disabled and the
  // card says why instead of pretending to execute.
  await dialog.getByRole('tab', { name: /^Directory/ }).click()
  const browse = dialog.getByTestId('plugin-browse-vector-path-healer')
  await expect(browse).toContainText('Catalog only')
  await browse.getByRole('button', { name: 'Install' }).click()
  await expect(browse).toContainText('Installed')

  await dialog.getByRole('tab', { name: /^Installed/ }).click()
  const installed = dialog.getByTestId('plugin-installed-vector-path-healer')
  await expect(installed).toContainText('Built into the editor')
  await expect(installed.getByRole('button', { name: 'Run' })).toBeDisabled()
})
