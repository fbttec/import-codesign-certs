import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {ExecOptions} from '@actions/exec/lib/interfaces'

export async function installCertIntoTemporaryKeychain(
  keychain: string,
  setupKeychain: boolean,
  keychainPassword: string,
  p12FilePath: string,
  p12Password: string
): Promise<void> {
  let output = ''
  const options: ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      output += data.toString()
    }
  }

  if (keychain.endsWith('.keychain')) {
    throw new Error('keychain name should not end in .keychain')
  }
  if (p12FilePath === '') {
    throw new Error('p12FilePath must not be empty')
  }
  // if (p12Password === '') {
  //   throw new Error('p12Password must not be empty')
  // }
  if (keychainPassword === '') {
    throw new Error('keychainPassword must not be empty')
  }

  const tempKeychain = `${keychain}.keychain`
  if (setupKeychain) {
    await createKeychain(tempKeychain, keychainPassword, options)
  }
  await unlockKeychain(tempKeychain, keychainPassword, options)
  await importPkcs12(tempKeychain, p12FilePath, p12Password, options)
  await setPartitionList(tempKeychain, keychainPassword)
  await updateKeychainList(tempKeychain, options)

  core.setOutput('security-response', output)
}

/**
 * Update the keychains list.
 * @param keychain The name of the keychain to include in list.
 * @param options Execution options (optional)
 */
async function updateKeychainList(
  keychain: string,
  options?: ExecOptions
): Promise<void> {
  const args: string[] = [
    'list-keychains',
    '-d',
    'user',
    '-s',
    keychain,
    'login.keychain'
  ]

  await exec.exec('security', args, options)
}

/**
 * Delete the specified keychain
 * @param keychain The name of the keychain to delete.
 * @param options Execution options (optional)
 */
export async function deleteKeychain(
  keychain: string,
  options?: ExecOptions
): Promise<void> {
  if (keychain.endsWith('.keychain')) {
    throw new Error('keychain name should not end in .keychain')
  }

  await exec.exec(
    'security',
    ['delete-keychain', `${keychain}.keychain`],
    options
  )
}

/**
 * Import a PKCS12 file into the keychain
 * @param keychain The name of the keychain to import the P12 file into.
 * @param p12FilePath The path to the .p12 file
 * @param p12Password The password used to decrypt the .p12 file.
 * @param options Execution options (optional)
 */
async function importPkcs12(
  keychain: string,
  p12FilePath: string,
  p12Password: string,
  options?: ExecOptions
): Promise<void> {
  const importArgs: string[] = [
    'import',
    p12FilePath,
    '-k',
    keychain,
    '-f',
    'pkcs12',
    // This option allows any application to read keys.
    // This would be insecure if the keychain was retained but GitHub action
    // VMs are thrown away after use.
    '-A',
    '-T',
    '/usr/bin/codesign',
    '-T',
    '/usr/bin/security',
    '-P',
    p12Password
  ]

  await exec.exec('security', importArgs, options)
}

/**
 * Sets the partition list for the specified keychain.
 * @param keychain The keychain to update.
 * @param password The keychain password.
 * @param options Execution options (optional)
 */
async function setPartitionList(
  keychain: string,
  password: string,
  options?: ExecOptions
): Promise<void> {
  const args: string[] = [
    'set-key-partition-list',
    '-S',
    'apple-tool:,apple:',
    '-k',
    password,
    keychain
  ]
  await exec.exec('security', args, options)
}

/**
 * Unlock the specified Keychain
 * @param keychain The keychain to unlock
 * @param password THe password to unlock with
 * @param options Execution options (optional)
 */
async function unlockKeychain(
  keychain: string,
  password: string,
  options?: ExecOptions
): Promise<void> {
  const args: string[] = ['unlock-keychain', '-p', password, keychain]
  await exec.exec('security', args, options)
}

/**
 * Creat a keychain with the specified name
 * @param keychain The keychain to create; The name should end with .keychain.
 * @param password THe password to unlock with.
 * @param options Execution options (optional)
 */
async function createKeychain(
  keychain: string,
  password: string,
  options: ExecOptions
): Promise<void> {
  const createArgs: string[] = ['create-keychain', '-p', password, keychain]
  await exec.exec('security', createArgs, options)

  // Set automatic keychain lock timeout to 6 hours.
  const setSettingsArgs: string[] = [
    'set-keychain-settings',
    '-lut',
    '21600',
    keychain
  ]
  await exec.exec('security', setSettingsArgs, options)
}
