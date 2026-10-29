import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { extractFigCraftCommands, extractZenuxsCommands } from '../src/command-catalog'

const fixtures: string[] = []

async function fixture() {
  const root = await mkdtemp(join(process.cwd(), '.figcraft-parity-'))
  fixtures.push(root)
  return root
}

async function source(root: string, path: string, content: string) {
  const file = join(root, path)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content, 'utf8')
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('extractFigCraftCommands', () => {
  test('extracts_zenuxs_commands_from_session_registry', () => {
    const commands = extractZenuxsCommands()

    expect(commands).toContainEqual({ id: 'shape.frame' })
  })

  test('extracts_single_line_command_ids', async () => {
    const root = await fixture()
    await source(
      root,
      'crates/engine/src/cmd/mod.rs',
      'pub mod basic;\nfn registry() { list.extend(basic::specs()); }\n'
    )
    await source(root, 'crates/engine/src/lib.rs', '')
    await source(
      root,
      'crates/engine/src/cmd/basic.rs',
      'pub fn specs() { vec![spec!("shape.create", "Create", "{}", true, run)] }\n'
    )

    await expect(extractFigCraftCommands(root)).resolves.toEqual([
      { id: 'shape.create', source: 'crates/engine/src/cmd/basic.rs', collaboration: false }
    ])
  })

  test('extracts_multiline_specs_with_nested_closures', async () => {
    const root = await fixture()
    await source(
      root,
      'crates/engine/src/cmd/mod.rs',
      'pub mod nested;\nfn registry() { list.extend(nested::specs()); }\n'
    )
    await source(root, 'crates/engine/src/lib.rs', '')
    await source(
      root,
      'crates/engine/src/cmd/nested.rs',
      `pub fn specs() {
  vec![spec!(
    "layout.apply",
    "Apply",
    "{ frame: { width, height } }",
    true,
    |session, params| {
      let nested = [|| { session.apply(params) }];
      nested[0]()
    }
  )]
}
`
    )

    await expect(extractFigCraftCommands(root)).resolves.toEqual([
      { id: 'layout.apply', source: 'crates/engine/src/cmd/nested.rs', collaboration: false }
    ])
  })

  test('ignores_comments_and_non_spec_text', async () => {
    const root = await fixture()
    await source(
      root,
      'crates/engine/src/cmd/mod.rs',
      'pub mod lexical;\nfn registry() { list.extend(lexical::specs()); }\n'
    )
    await source(root, 'crates/engine/src/lib.rs', '')
    await source(
      root,
      'crates/engine/src/cmd/lexical.rs',
      `pub fn specs() {
  // spec!("comment.line", "x", "{}", false, run)
  let text = "spec!(\\"comment.string\\", \\"x\\", \\"{}\\", false, run)";
  /* outer /* spec!("comment.block", "x", "{}", false, run) */ end */
  vec![other_spec!("not.a.command"), spec!("real.command", "Real", "{}", false, run)]
}
`
    )

    await expect(extractFigCraftCommands(root)).resolves.toEqual([
      { id: 'real.command', source: 'crates/engine/src/cmd/lexical.rs', collaboration: false }
    ])
  })

  test('follows_registered_root_and_cmd_modules', async () => {
    const root = await fixture()
    await source(
      root,
      'crates/engine/src/cmd/mod.rs',
      `pub mod local;
fn registry() {
  list.extend(local::specs());
  list.extend(crate::root_area::specs());
}
`
    )
    await source(root, 'crates/engine/src/lib.rs', 'pub mod root_area;\npub mod unused_area;\n')
    await source(
      root,
      'crates/engine/src/cmd/local.rs',
      'pub fn specs() { vec![spec!("local.command", "Local", "{}", false, run)] }\n'
    )
    await source(
      root,
      'crates/engine/src/root_area.rs',
      `pub mod child;
pub fn specs() {
  vec![spec!("root.command", "Root", "{}", false, run)]
    .into_iter()
    .chain(child::specs())
    .collect()
}
`
    )
    await source(
      root,
      'crates/engine/src/root_area/child.rs',
      'pub fn specs() { vec![spec!("root.child", "Child", "{}", false, run)] }\n'
    )
    await source(
      root,
      'crates/engine/src/unused_area.rs',
      'pub fn specs() { vec![spec!("unused.command", "Unused", "{}", false, run)] }\n'
    )

    await expect(extractFigCraftCommands(root)).resolves.toEqual([
      { id: 'local.command', source: 'crates/engine/src/cmd/local.rs', collaboration: false },
      { id: 'root.command', source: 'crates/engine/src/root_area.rs', collaboration: false },
      {
        id: 'root.child',
        source: 'crates/engine/src/root_area/child.rs',
        collaboration: false
      }
    ])
  })

  test('follows_registered_direct_child_of_file_module', async () => {
    const root = await fixture()
    await source(
      root,
      'crates/engine/src/cmd/mod.rs',
      'fn registry() { list.extend(crate::foo::child::specs()); }\n'
    )
    await source(root, 'crates/engine/src/lib.rs', 'pub mod foo;\n')
    await source(root, 'crates/engine/src/foo.rs', 'pub mod child;\n')
    await source(
      root,
      'crates/engine/src/foo/child.rs',
      'pub fn specs() { vec![spec!("file.module.child", "Child", "{}", false, run)] }\n'
    )

    await expect(extractFigCraftCommands(root)).resolves.toEqual([
      {
        id: 'file.module.child',
        source: 'crates/engine/src/foo/child.rs',
        collaboration: false
      }
    ])
  })

  test('ignores_unregistered_and_test_only_specs', async () => {
    const root = await fixture()
    await source(
      root,
      'crates/engine/src/cmd/mod.rs',
      'pub mod registered;\npub mod unregistered;\nfn registry() { list.extend(registered::specs()); }\n'
    )
    await source(root, 'crates/engine/src/lib.rs', '')
    await source(
      root,
      'crates/engine/src/cmd/registered.rs',
      `pub fn specs() {
  vec![spec!("registered.command", "Registered", "{}", false, run)]
}
#[cfg(test)]
mod tests {
  fn test_spec() { let _ = spec!("test.only", "Test", "{}", false, run); }
}
`
    )
    await source(
      root,
      'crates/engine/src/cmd/unregistered.rs',
      'pub fn specs() { vec![spec!("unregistered.command", "Unregistered", "{}", false, run)] }\n'
    )

    await expect(extractFigCraftCommands(root)).resolves.toEqual([
      {
        id: 'registered.command',
        source: 'crates/engine/src/cmd/registered.rs',
        collaboration: false
      }
    ])
  })

  test('rejects_malformed_spec_id', async () => {
    const root = await fixture()
    await source(
      root,
      'crates/engine/src/cmd/mod.rs',
      'pub mod malformed;\nfn registry() { list.extend(malformed::specs()); }\n'
    )
    await source(root, 'crates/engine/src/lib.rs', '')
    await source(
      root,
      'crates/engine/src/cmd/malformed.rs',
      'pub fn specs() { vec![spec!(42, "Invalid", "{}", false, run)] }\n'
    )

    await expect(extractFigCraftCommands(root)).rejects.toThrow(
      /crates\/engine\/src\/cmd\/malformed\.rs:\d+: malformed spec! declaration/
    )
  })

  test('classifies_only_explicit_collaboration_ids', async () => {
    const root = await fixture()
    await source(
      root,
      'crates/engine/src/cmd/mod.rs',
      'pub mod mixed;\nfn registry() { list.extend(mixed::specs()); }\n'
    )
    await source(root, 'crates/engine/src/lib.rs', '')
    await source(
      root,
      'crates/engine/src/cmd/mixed.rs',
      `pub fn specs() {
  vec![
    spec!("collab.join", "Join", "{}", false, run),
    spec!("component.create", "Create component", "{}", true, run)
  ]
}
`
    )

    await expect(extractFigCraftCommands(root)).resolves.toEqual([
      { id: 'collab.join', source: 'crates/engine/src/cmd/mixed.rs', collaboration: true },
      {
        id: 'component.create',
        source: 'crates/engine/src/cmd/mixed.rs',
        collaboration: false
      }
    ])
  })
})
