#!/bin/bash
# The "Updating ~/flowmate after step 0b" block from deploy/oci/db/README.md, run EXACTLY as the
# operator pastes it (extracted between the flowmate-update-block markers; only the
# R=/home/ubuntu/flowmate line is pointed at a throwaway clone) against throwaway git repos.
# No network, no Docker; bash 3.2+, git 2.25+, perl (resets SIGINT to default for the block).
#
# Every case asserts that a pre-existing unrelated operator stash is untouched; every case except
# the two that are about an unguarded file (refused up front, restore failure) also asserts that
# the final deploy.sh carries the guard marker exactly once, passes bash -n and has no conflict
# markers. Ctrl-C is simulated with stubs that send SIGINT to the block's subshell and die of
# SIGINT themselves (what a terminal's ^C does to the foreground process group), instead of running
# the real command: a git stub at the fetch or merge step, and a bash stub at the n-th `bash -n`
# (the post-merge usable() check). No real running git is interrupted.
#
#   bash deploy/oci/db/tests/update-checkout.test.sh
# shellcheck disable=SC2015,SC2016  # SC2015: ok() always succeeds; SC2016: single-quoted code for perl/bash -c
set -u
# English messages from git (the test greps them; OCI's default locale is Korean)
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
README=$(cd -- "$(dirname -- "$0")/.." && pwd)/README.md
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
pass=0
fail=0
ok() { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }

# --- extract the pasted blocks (update block + the two "Current blockers" blocks)
extract() { # MARKER OUT
  awk -v m="$1" '$0 == "<!-- " m ":begin -->" {f = 1; next} $0 == "<!-- " m ":end -->" {f = 0} f' "$README" >"$work/raw.md"
  [ "$(head -n 1 "$work/raw.md")" = '```bash' ] && [ "$(tail -n 1 "$work/raw.md")" = '```' ] &&
    [ "$(grep -c '^  R=/home/ubuntu/flowmate$' "$work/raw.md")" = 1 ] && [ "$(grep -c "$1:begin" "$README")" = 1 ] ||
    { echo "FAIL README block $1 not found or not in the expected shape"; exit 1; }
  sed '1d;$d' "$work/raw.md" >"$2"
}
extract flowmate-update-block "$work/block.sh"
extract flowmate-blockers-check "$work/check.sh"
extract flowmate-blockers-fix "$work/fix.sh"
[ "$(grep -c '^  H=/home/ubuntu$' "$work/fix.sh")" = 1 ] || { echo "FAIL fix block: no single H=/home/ubuntu line"; exit 1; }
! grep -vE '^ *#' "$work/block.sh" | grep -qw stash &&
  ok "README block extracted ($(wc -l <"$work/block.sh" | tr -d ' ') lines); it never runs git stash" || bad "block uses git stash"

# --- isolated git environment + stubs (pass-through unless a STUB_* variable is set)
export HOME="$work/home" XDG_CONFIG_HOME="$work/home/.config" GIT_CONFIG_NOSYSTEM=1
mkdir -p "$HOME" "$work/stubs"
git config --global user.name test
git config --global user.email test@example.invalid
git config --global commit.gpgsign false
git config --global advice.detachedHead false
REAL_GIT=$(command -v git)
REAL_CP=$(command -v cp)
REAL_BASH=$(command -v bash)
export REAL_GIT REAL_CP REAL_BASH
cat >"$work/stubs/git" <<'STUB'
#!/bin/bash
# the block always calls `git -C <dir> <cmd> ...`; STUB_INT_ON=<cmd>: Ctrl-C while <cmd> runs
if [ -n "${STUB_INT_ON:-}" ] && [ "${3:-}" = "$STUB_INT_ON" ]; then
  kill -INT "$PPID"
  kill -INT $$
  sleep 5
fi
# STUB_DIFF_FAIL=1: `git -C <dir> diff HEAD ...` (the blocker fix's patch save) fails without output
if [ -n "${STUB_DIFF_FAIL:-}" ] && [ "${3:-}" = diff ] && [ "${4:-}" = HEAD ]; then exit 2; fi
exec "$REAL_GIT" "$@"
STUB
cat >"$work/stubs/cp" <<'STUB'
#!/bin/bash
# STUB_CP_FAIL_RESTORE=1: the restore copy (*.restore.*) fails
if [ -n "${STUB_CP_FAIL_RESTORE:-}" ]; then
  case "$*" in *.restore.*) echo "cp: simulated failure" >&2; exit 1 ;; esac
fi
exec "$REAL_CP" "$@"
STUB
cat >"$work/stubs/bash" <<'STUB'
#!/bin/sh
# STUB_INT_ON_BASH_N=<n>: Ctrl-C at the n-th `bash -n` (usable() check) of the block; counter in $STUB_COUNTER
if [ -n "${STUB_INT_ON_BASH_N:-}" ] && [ "${1:-}" = -n ]; then
  c=$(($(cat "$STUB_COUNTER" 2>/dev/null || echo 0) + 1))
  echo "$c" >"$STUB_COUNTER"
  if [ "$c" = "$STUB_INT_ON_BASH_N" ]; then
    kill -INT "$PPID"
    kill -INT $$
    sleep 5
  fi
fi
exec "$REAL_BASH" "$@"
STUB
chmod +x "$work/stubs/git" "$work/stubs/cp" "$work/stubs/bash"

MARK='# flowmate-deploy-guard: v1'
U1='#!/bin/bash\necho "old main, no guard"\n'
G1="#!/bin/bash\n$MARK\necho guarded v1\n"
G2="#!/bin/bash\n$MARK\necho guarded v2\nexit 0\n"
U2='#!/bin/bash\necho "newer main, no guard"\n'
BROKEN="#!/bin/bash\n$MARK\nif then\n"
F=deploy/oci/deploy.sh

# world NAME: origin (bare) + dev (pushes to main) + oci (the ~/flowmate clone, at the initial main,
# with an operator stash, the step-0b guarded deploy.sh G1 installed (dirty) and a .pre-oci copy)
world() {
  w="$work/$1"
  mkdir -p "$w"
  git init -q --bare "$w/origin.git" && git -C "$w/origin.git" symbolic-ref HEAD refs/heads/main
  git init -q "$w/dev" && git -C "$w/dev" symbolic-ref HEAD refs/heads/main
  mkdir -p "$w/dev/deploy/oci" "$w/dev/src/lib/crawler"
  printf '%b' "$U1" >"$w/dev/$F"
  echo "worker v1" >"$w/dev/src/lib/crawler/worker.ts"
  echo "notes v1" >"$w/dev/notes.txt"
  git -C "$w/dev" add -A && git -C "$w/dev" commit -q -m initial
  git -C "$w/dev" remote add origin "$w/origin.git" && git -C "$w/dev" push -q origin main
  git clone -q "$w/origin.git" "$w/oci"
  echo "operator wip" >>"$w/oci/notes.txt"
  git -C "$w/oci" stash push -q -m operator-wip -- notes.txt
  stash_before=$(git -C "$w/oci" stash list --format='%H %gs'; git -C "$w/oci" rev-parse -q --verify refs/stash)
  cp -p "$w/oci/$F" "$w/oci/$F.pre-oci-20261103T000000Z"
  printf '%b' "$G1" >"$w/oci/$F"
  oci="$w/oci"
}
push_main() { # MSG [PATH CONTENT]...: commit on dev and push to origin main
  local msg=$1
  shift
  while [ $# -ge 2 ]; do
    mkdir -p "$(dirname -- "$w/dev/$1")"
    printf '%b' "$2" >"$w/dev/$1"
    shift 2
  done
  git -C "$w/dev" add -A && git -C "$w/dev" commit -q -m "$msg" && git -C "$w/dev" push -q origin main
}
run_block() { # NAME [ENV=VAL...]: run the README block against $oci (bash, SIGINT at default); sets out
  local name=$1
  shift
  sed "s#^  R=/home/ubuntu/flowmate\$#  R=$oci#" "${BLOCK:-$work/block.sh}" >"$work/$name.sh"
  (cd "$work" && env PATH="$work/stubs:$PATH" "$@" perl -e '$SIG{INT} = "DEFAULT"; exec @ARGV' bash "$work/$name.sh") >"$work/$name.out" 2>&1
  out="$work/$name.out"
}
succeeded() { grep -q '^OK: HEAD' "$out" && ! grep -q 'update block failed' "$out"; }
failed_rc() { grep -q "^update block failed (rc=$1)" "$out" && ! grep -q '^OK: HEAD' "$out"; } # RC regex
stash_ok() { [ "$(git -C "$oci" stash list --format='%H %gs'; git -C "$oci" rev-parse -q --verify refs/stash)" = "$stash_before" ] &&
  [ "$(git -C "$oci" stash list | wc -l | tr -d ' ')" = 1 ] && ! git -C "$oci" diff --quiet 'stash@{0}' -- notes.txt 2>/dev/null; }
final_ok() { # NAME: the final deploy.sh is guarded/parseable/clean, and the operator stash is untouched
  local d="$oci/$F"
  [ "$(grep -c 'flowmate-deploy-guard: v1' "$d")" = 1 ] && bash -n "$d" 2>/dev/null && ! grep -qE '^(<<<<<<<|=======|>>>>>>>)' "$d" && stash_ok ||
    { cat "$out"; bad "$1: final deploy.sh not guarded/parseable/clean, or the operator stash changed"; return 1; }
}
same() { cmp -s "$oci/$F" <(printf '%b' "$1"); }
head_is_main() { [ "$(git -C "$oci" rev-parse HEAD)" = "$(git -C "$w/origin.git" rev-parse main)" ]; }
no_saved() { ! ls "$oci/$F".pre-pull-* >/dev/null 2>&1; }

# 0. the normal case: main now ships the same guarded deploy.sh
world normal
push_main "merge guarded deploy.sh" "$F" "$G1"
run_block normal
succeeded && final_ok normal && same "$G1" && head_is_main && git -C "$oci" diff --quiet HEAD -- "$F" &&
  ok "main ships the step-0b deploy.sh: fetch + fast-forward, clean checkout, guarded, operator stash untouched" || { cat "$out"; bad "normal"; }

# 1. re-run after success: deploy.sh already equals HEAD; main moved on (unrelated change)
push_main "unrelated" src/other.txt 'x\n'
run_block rerun
succeeded && final_ok rerun && same "$G1" && head_is_main && grep -q 'nothing parked' "$out" &&
  ok "re-run after success (deploy.sh == HEAD): nothing parked, fast-forward, still guarded, stash untouched" || { cat "$out"; bad "rerun"; }

# 2. main ships an UNGUARDED deploy.sh
world unguarded
push_main "unguarded change" "$F" "$U2"
run_block unguarded
failed_rc 1 && final_ok unguarded && same "$G1" && head_is_main && grep -q "WARNING: main's deploy.sh is unguarded or broken. STOP" "$out" &&
  grep -q 'guarded deploy.sh restored from .*pre-pull-' "$out" &&
  ok "main's deploy.sh unguarded: merged, trap restored the guarded copy, rc=1 + WARNING (STOP), stash untouched" || { cat "$out"; bad "unguarded"; }

# 2b. same, but nothing was parked (deploy.sh == HEAD, guarded) when main turns unguarded
world unguarded_clean
push_main "merge guarded deploy.sh" "$F" "$G1"
git -C "$oci" checkout -q -- "$F" && git -C "$oci" pull -q --ff-only origin main
push_main "unguarded change" "$F" "$U2"
run_block unguarded_clean
failed_rc 1 && final_ok unguarded_clean && same "$G1" && head_is_main && grep -q 'nothing parked' "$out" && grep -q 'WARNING' "$out" &&
  ok "nothing parked, then main unguarded: the pre-merge copy is restored, rc=1" || { cat "$out"; bad "unguarded_clean"; }

# 2c. main ships a guarded but unparseable deploy.sh
world broken
push_main "broken" "$F" "$BROKEN"
run_block broken
failed_rc 1 && final_ok broken && same "$G1" && grep -q 'WARNING' "$out" &&
  ok "main's deploy.sh guarded but bash -n fails: guarded copy restored, rc=1" || { cat "$out"; bad "broken"; }

# 3. main ships a NEWER guarded deploy.sh that differs from the parked one: keep main's (never roll back)
world newer
push_main "newer guarded" "$F" "$G2"
run_block newer
succeeded && final_ok newer && same "$G2" && head_is_main && git -C "$oci" diff --quiet HEAD -- "$F" &&
  ok "main's newer guarded deploy.sh differs from the parked one: main's kept, no conflict, stash untouched" || { cat "$out"; bad "newer"; }

# 4. an untracked file that main ships blocks the fast-forward
world untracked
echo "local copy" >"$oci/src/lib/crawler/content-agency-parser.ts"
before_head=$(git -C "$oci" rev-parse HEAD)
push_main "ship parser + guarded deploy.sh" src/lib/crawler/content-agency-parser.ts 'shipped\n' "$F" "$G1"
run_block untracked
failed_rc 1 && final_ok untracked && same "$G1" && [ "$(git -C "$oci" rev-parse HEAD)" = "$before_head" ] &&
  grep -q 'MERGE REFUSED' "$out" && grep -q '^?? src/lib/crawler/content-agency-parser.ts' "$out" && grep -q 'untracked working tree files would be overwritten' "$out" &&
  grep -q 'guarded deploy.sh restored from' "$out" && [ "$(cat "$oci/src/lib/crawler/content-agency-parser.ts")" = "local copy" ] &&
  ok "untracked path main ships: merge refused (git's error shown), status printed, guarded copy restored, rc=1" || { cat "$out"; bad "untracked"; }

# 4b. a dirty tracked file that main also changes blocks the fast-forward
world dirty
echo "local edit" >>"$oci/src/lib/crawler/worker.ts"
before_head=$(git -C "$oci" rev-parse HEAD)
push_main "worker change + guarded deploy.sh" src/lib/crawler/worker.ts 'worker v2\n' "$F" "$G1"
run_block dirty
failed_rc 1 && final_ok dirty && same "$G1" && [ "$(git -C "$oci" rev-parse HEAD)" = "$before_head" ] &&
  grep -q '^ M src/lib/crawler/worker.ts' "$out" && grep -q 'local edit' "$oci/src/lib/crawler/worker.ts" &&
  ok "dirty worker.ts that main changes: merge refused, worker.ts untouched, guarded copy restored, rc=1" || { cat "$out"; bad "dirty"; }

# 6. Ctrl-C during the network step (fetch): deploy.sh never touched, nothing saved
world int_fetch
before_head=$(git -C "$oci" rev-parse HEAD)
push_main "merge guarded deploy.sh" "$F" "$G1"
run_block int_fetch STUB_INT_ON=fetch
failed_rc 130 && final_ok int_fetch && same "$G1" && [ "$(git -C "$oci" rev-parse HEAD)" = "$before_head" ] && no_saved &&
  ok "Ctrl-C during fetch: subshell dies (rc=130), deploy.sh untouched and guarded, nothing saved" || { cat "$out"; bad "int_fetch"; }

# 7. Ctrl-C during the merge (after HEAD's unguarded copy was checked out): the trap restores
world int_merge
before_head=$(git -C "$oci" rev-parse HEAD)
push_main "merge guarded deploy.sh" "$F" "$G2"
run_block int_merge STUB_INT_ON=merge
failed_rc 130 && final_ok int_merge && same "$G1" && [ "$(git -C "$oci" rev-parse HEAD)" = "$before_head" ] &&
  grep -q 'parked as' "$out" && grep -q 'guarded deploy.sh restored from .*pre-pull-' "$out" && grep -q 'the merge may have been interrupted: re-run the block' "$out" &&
  ok "Ctrl-C during merge (unguarded HEAD copy live): trap restored the guarded copy + 're-run the block' hint, rc=130" || { cat "$out"; bad "int_merge"; }
run_block int_merge_rerun
succeeded && final_ok int_merge_rerun && same "$G2" && head_is_main && grep -q 'parked as' "$out" &&
  ok "plain re-run after the interrupted merge (no manual action): OK, main's guarded copy, stash untouched" || { cat "$out"; bad "int_merge_rerun"; }

# 7b. Ctrl-C right after a successful merge (at the usable() check): main's newer guarded copy stays
world int_after_merge
push_main "newer guarded" "$F" "$G2"
run_block int_after_merge STUB_INT_ON_BASH_N=2 STUB_COUNTER="$work/int_after_merge.count"
failed_rc 130 && final_ok int_after_merge && same "$G2" && head_is_main && ! grep -q 'restored from' "$out" &&
  ok "Ctrl-C after the merge: the older saved copy is NOT copied over main's newer guarded one" || { cat "$out"; bad "int_after_merge"; }

# 7c. deploy.sh staged in the index (git add): checkout HEAD resets index and work tree, merge succeeds
world staged
git -C "$oci" add "$F"
push_main "newer guarded" "$F" "$G2"
run_block staged
succeeded && final_ok staged && same "$G2" && head_is_main && git -C "$oci" diff --cached --quiet -- "$F" && git -C "$oci" diff --quiet HEAD -- "$F" &&
  ok "staged deploy.sh: reset from HEAD (index + work tree), fast-forward to main's newer guarded copy" || { cat "$out"; bad "staged"; }

# 8. the restore copy fails: RESTORE FAILED with the saved path, non-zero
world restore_fail
push_main "unguarded change" "$F" "$U2"
run_block restore_fail STUB_CP_FAIL_RESTORE=1
saved=""
for f in "$oci/$F".pre-pull-*; do [ -e "$f" ] && saved=$f && break; done
failed_rc 1 && grep -q "^RESTORE FAILED: .*may be unguarded.*Saved copy: $saved" "$out" && [ -n "$saved" ] && cmp -s "$saved" <(printf '%b' "$G1") &&
  ! grep -q 'restored from' "$out" && stash_ok &&
  ok "restore cp fails: 'RESTORE FAILED' + saved path ($(basename "$saved")) printed, rc=1, stash untouched" || { cat "$out"; bad "restore_fail"; }

# 9. local commits on HEAD (e.g. `git commit -a` swept the guarded deploy.sh in): refused, untouched
world local_commit
git -C "$oci" commit -q -a -m "local: commit -a swept deploy.sh"
before_head=$(git -C "$oci" rev-parse HEAD)
push_main "merge guarded deploy.sh" "$F" "$G1"
run_block local_commit
failed_rc 1 && final_ok local_commit && same "$G1" && [ "$(git -C "$oci" rev-parse HEAD)" = "$before_head" ] && no_saved &&
  grep -q 'REFUSED: ~/flowmate has local commits on main' "$out" && grep -q 'local: commit -a swept deploy.sh' "$out" &&
  ok "local commit on HEAD: refused before touching deploy.sh, the commit listed, rc=1" || { cat "$out"; bad "local_commit"; }

# 10. live deploy.sh unguarded at the start (e.g. an earlier interrupted run): refused up front
world unguarded_live
git -C "$oci" checkout -q -- "$F"
before_head=$(git -C "$oci" rev-parse HEAD)
push_main "merge guarded deploy.sh" "$F" "$G1"
run_block unguarded_live
failed_rc 1 && same "$U1" && [ "$(git -C "$oci" rev-parse HEAD)" = "$before_head" ] && no_saved && stash_ok &&
  grep -q 'REFUSED: current .* is not the guarded copy; re-run step 0b first' "$out" && ! grep -q 'restored from' "$out" &&
  ok "live deploy.sh unguarded: refused up front, nothing fetched/saved/restored, rc=1" || { cat "$out"; bad "unguarded_live"; }

# 11. parent shell with `set -e`: the outer shell survives a failing block and prints the message
world errexit
echo "local copy" >"$oci/src/lib/crawler/content-agency-parser.ts"
push_main "ship parser + guarded deploy.sh" src/lib/crawler/content-agency-parser.ts 'shipped\n' "$F" "$G1"
sed "s#^  R=/home/ubuntu/flowmate\$#  R=$oci#" "$work/block.sh" >"$work/errexit.sh"
(cd "$work" && env PATH="$work/stubs:$PATH" bash -e -c '. "$1"; echo OUTER_SHELL_SURVIVED' _ "$work/errexit.sh") >"$work/errexit.out" 2>&1
out="$work/errexit.out"
failed_rc 1 && grep -q '^OUTER_SHELL_SURVIVED$' "$out" && final_ok errexit && same "$G1" &&
  ok "parent shell with set -e: block fails (rc=1), message printed, outer shell continues" || { cat "$out"; bad "errexit"; }

# 12. "Current blockers" blocks under `set -e`: identical parser, every added worker.ts line (one blank) in main
blockers_world() { # NAME LOCAL_EXTRA: local worker.ts adds A, blank, B (+ LOCAL_EXTRA); main adds A, blank, B, C
  world "$1"
  mkdir -p "$w/home-ubuntu"
  push_main "worker + parser + guarded deploy.sh" src/lib/crawler/worker.ts 'worker v1\nline A\n\nline B\nline C\n' \
    src/lib/crawler/content-agency-parser.ts 'shipped parser\n' "$F" "$G1"
  printf 'worker v1\nline A\n\nline B\n%b' "$2" >"$oci/src/lib/crawler/worker.ts"
  printf 'shipped parser\n' >"$oci/src/lib/crawler/content-agency-parser.ts"
}
run_errexit() { # NAME BLOCKFILE: run under `bash -e` like a pasted block in an errexit shell; sets out
  sed -e "s#^  R=/home/ubuntu/flowmate\$#  R=$oci#" -e "s#^  H=/home/ubuntu\$#  H=$w/home-ubuntu#" "$2" >"$work/$1.sh"
  (cd "$work" && env PATH="$work/stubs:$PATH" bash -e -c '. "$1"; echo OUTER_SHELL_SURVIVED' _ "$work/$1.sh") >"$work/$1.out" 2>&1
  out="$work/$1.out"
}
blockers_world blockers ''
run_errexit blockers_check "$work/check.sh"
grep -q '^ok: content-agency-parser.ts is identical' "$out" && grep -q '^ok: every line the local worker.ts adds is already in main.s (0 unmatched)' "$out" &&
  grep -q '^ok: both checks passed$' "$out" && grep -q '^OUTER_SHELL_SURVIVED$' "$out" && ! grep -q 're-check failed' "$out" &&
  ok "blocker re-check under set -e (grep -c prints 0 / exits 1): both ok lines, outer shell survives" || { cat "$out"; bad "blockers_check"; }
patches() { find "$w/home-ubuntu" -name 'worker.ts.local-*.patch' "$@" | wc -l | tr -d ' '; }
parsers() { find "$w/home-ubuntu" -name 'content-agency-parser.ts.pre-pull-*' | wc -l | tr -d ' '; }
run_errexit blockers_fix "$work/fix.sh"
p=""
for f in "$w"/home-ubuntu/worker.ts.local-*.patch; do [ -s "$f" ] && p=$f; done
grep -q '^worker.ts: local diff saved' "$out" && grep -q '^parser: moved to' "$out" && grep -q '^ok: blockers cleared$' "$out" &&
  grep -q '^OUTER_SHELL_SURVIVED$' "$out" && [ -n "$p" ] && grep -q '^+line A' "$p" &&
  git -C "$oci" diff --quiet -- src/lib/crawler/worker.ts && [ ! -e "$oci/src/lib/crawler/content-agency-parser.ts" ] &&
  ls "$w"/home-ubuntu/content-agency-parser.ts.pre-pull-* >/dev/null 2>&1 && stash_ok &&
  ok "blocker fix under set -e: worker.ts diff saved + reset, parser moved aside, outer shell survives" || { cat "$out"; bad "blockers_fix"; }
sleep 1   # a re-run in the same second would reuse the timestamp
run_errexit blockers_fix_rerun "$work/fix.sh"
grep -q '^worker.ts: nothing to park$' "$out" && grep -q '^parser: nothing to move$' "$out" && grep -q '^ok: blockers cleared$' "$out" &&
  ! grep -q 'STOP' "$out" && [ "$(patches)" = 1 ] && [ "$(patches -size 0)" = 0 ] && [ "$(parsers)" = 1 ] &&
  ok "blocker fix re-run after success: nothing to park / nothing to move, no new or empty patch" || { cat "$out"; bad "blockers_fix_rerun"; }
run_block blockers_update
succeeded && final_ok blockers_update && same "$G1" && head_is_main &&
  ok "after the blocker fix the update block fast-forwards cleanly" || { cat "$out"; bad "blockers_update"; }

# already-clean worker.ts, only the untracked parser present
blockers_world blockers_parser_only ''
git -C "$oci" checkout -q -- src/lib/crawler/worker.ts
run_errexit blockers_parser_only "$work/fix.sh"
grep -q '^worker.ts: nothing to park$' "$out" && grep -q '^parser: moved to' "$out" && grep -q '^ok: blockers cleared$' "$out" &&
  [ "$(patches)" = 0 ] && [ ! -e "$oci/src/lib/crawler/content-agency-parser.ts" ] && [ "$(parsers)" = 1 ] &&
  ok "blocker fix with a clean worker.ts: no patch file, parser still moved aside" || { cat "$out"; bad "blockers_parser_only"; }

# saving the worker.ts diff fails: STOP, no (empty) patch left behind, nothing reset or moved
blockers_world blockers_difffail ''
STUB_DIFF_FAIL=1 run_errexit blockers_difffail "$work/fix.sh"
grep -q '^STOP: the worker.ts diff could not be saved$' "$out" && grep -q '^resolution failed (rc=1)' "$out" && grep -q '^OUTER_SHELL_SURVIVED$' "$out" &&
  [ "$(patches)" = 0 ] && ! git -C "$oci" diff --quiet -- src/lib/crawler/worker.ts && [ -e "$oci/src/lib/crawler/content-agency-parser.ts" ] &&
  ok "worker.ts diff save fails: STOP, empty patch removed, worker.ts and parser untouched" || { cat "$out"; bad "blockers_difffail"; }

# staged worker.ts changes: the re-check sees them (incl. a local-only line), the fix saves and resets them
blockers_world blockers_staged_neg 'local only line\n'
git -C "$oci" add src/lib/crawler/worker.ts
run_errexit blockers_staged_neg "$work/check.sh"
grep -q '^STOP: 1 added line(s) of the local worker.ts are not in main' "$out" && grep -q '^OUTER_SHELL_SURVIVED$' "$out" &&
  ok "re-check with STAGED worker.ts changes incl. a local-only line: STOP (not a vacuous ok)" || { cat "$out"; bad "blockers_staged_neg"; }
blockers_world blockers_staged ''
git -C "$oci" add src/lib/crawler/worker.ts
run_errexit blockers_staged_check "$work/check.sh"
grep -q '^ok: both checks passed$' "$out" || { cat "$out"; bad "blockers_staged check"; }
run_errexit blockers_staged_fix "$work/fix.sh"
p=""
for f in "$w"/home-ubuntu/worker.ts.local-*.patch; do [ -s "$f" ] && p=$f; done
grep -q '^worker.ts: local diff saved' "$out" && [ -n "$p" ] && grep -q '^+line A' "$p" &&
  git -C "$oci" diff --quiet HEAD -- src/lib/crawler/worker.ts && git -C "$oci" diff --cached --quiet -- src/lib/crawler/worker.ts &&
  ok "STAGED worker.ts changes: re-check ok, fix saves the HEAD diff and resets index + work tree" || { cat "$out"; bad "blockers_staged"; }

blockers_world blockers_neg 'local only line\n'
run_errexit blockers_neg "$work/check.sh"
grep -q '^STOP: 1 added line(s) of the local worker.ts are not in main' "$out" && grep -q '^re-check failed (rc=1)' "$out" &&
  grep -q '^OUTER_SHELL_SURVIVED$' "$out" && ! grep -q 'both checks passed' "$out" &&
  ok "blocker re-check with a local-only worker.ts line: STOP (1 line), outer shell survives" || { cat "$out"; bad "blockers_neg"; }

# 5. the operator stash is asserted untouched in every case above; also: no stash was created anywhere
for d in "$work"/*/oci; do [ "$(git -C "$d" stash list | wc -l | tr -d ' ')" = 1 ] || bad "stash count in $d"; done
ok "every repo still has exactly its one operator stash"

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
