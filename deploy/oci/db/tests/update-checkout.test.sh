#!/bin/bash
# The "Updating ~/flowmate after step 0b" block from deploy/oci/db/README.md, run EXACTLY as the
# operator pastes it (extracted between the flowmate-update-block markers; only the
# R=/home/ubuntu/flowmate line is pointed at a throwaway clone) against throwaway git repos.
# No network, no Docker; bash 3.2+ and git 2.25+.
#
# Every case asserts: the final deploy.sh carries the guard marker exactly once, passes bash -n
# and has no conflict markers, and a pre-existing unrelated operator stash is untouched.
#
#   bash deploy/oci/db/tests/update-checkout.test.sh
# shellcheck disable=SC2015  # `check && ok ... || bad ...`: ok() always succeeds
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

# --- extract the pasted block
awk '/^<!-- flowmate-update-block:begin -->$/ {f = 1; next} /^<!-- flowmate-update-block:end -->$/ {f = 0} f' "$README" >"$work/raw.md"
[ "$(head -n 1 "$work/raw.md")" = '```bash' ] && [ "$(tail -n 1 "$work/raw.md")" = '```' ] &&
  [ "$(grep -c '^  R=/home/ubuntu/flowmate$' "$work/raw.md")" = 1 ] && [ "$(grep -c 'flowmate-update-block:begin' "$README")" = 1 ] ||
  { echo "FAIL README block not found or not in the expected shape"; exit 1; }
sed '1d;$d' "$work/raw.md" >"$work/block.sh"
! grep -vE '^ *#' "$work/block.sh" | grep -qw stash &&
  ok "README block extracted ($(wc -l <"$work/block.sh" | tr -d ' ') lines); it never runs git stash" || bad "block uses git stash"

# --- isolated git environment
export HOME="$work/home" XDG_CONFIG_HOME="$work/home/.config" GIT_CONFIG_NOSYSTEM=1
mkdir -p "$HOME"
git config --global user.name test
git config --global user.email test@example.invalid
git config --global commit.gpgsign false
git config --global advice.detachedHead false

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
run_block() { # NAME: run the README block against $oci; sets rc, out
  sed "s#^  R=/home/ubuntu/flowmate\$#  R=$oci#" "$work/block.sh" >"$work/$1.sh"
  (cd "$work" && bash "$work/$1.sh") >"$work/$1.out" 2>&1
  rc=$?
  out="$work/$1.out"
}
final_ok() { # NAME: invariants that must hold after every run
  local d="$oci/$F"
  [ "$(grep -c 'flowmate-deploy-guard: v1' "$d")" = 1 ] && bash -n "$d" 2>/dev/null && ! grep -qE '^(<<<<<<<|=======|>>>>>>>)' "$d" &&
    [ "$(git -C "$oci" stash list --format='%H %gs'; git -C "$oci" rev-parse -q --verify refs/stash)" = "$stash_before" ] &&
    [ "$(git -C "$oci" stash list | wc -l | tr -d ' ')" = 1 ] && ! git -C "$oci" diff --quiet 'stash@{0}' -- notes.txt 2>/dev/null ||
    { cat "$out"; bad "$1: final deploy.sh not guarded/parseable/clean, or the operator stash changed"; return 1; }
}
same() { cmp -s "$oci/$F" <(printf '%b' "$1"); }
head_is_main() { [ "$(git -C "$oci" rev-parse HEAD)" = "$(git -C "$w/origin.git" rev-parse main)" ]; }

# 0. the normal case: main now ships the same guarded deploy.sh
world normal
push_main "merge guarded deploy.sh" "$F" "$G1"
run_block normal
[ "$rc" = 0 ] && final_ok normal && same "$G1" && head_is_main && git -C "$oci" diff --quiet HEAD -- "$F" && grep -q '^OK: HEAD' "$out" &&
  ok "main ships the step-0b deploy.sh: fast-forward, clean checkout, guarded, operator stash untouched" || bad "normal"

# 1. re-run after success: deploy.sh already equals HEAD; main moved on (unrelated change)
push_main "unrelated" src/other.txt 'x\n'
run_block rerun
[ "$rc" = 0 ] && final_ok rerun && same "$G1" && head_is_main && grep -q 'nothing parked' "$out" &&
  ok "re-run after success (deploy.sh == HEAD): nothing parked, fast-forward, still guarded, stash untouched" || bad "rerun"

# 2. main ships an UNGUARDED deploy.sh
world unguarded
push_main "unguarded change" "$F" "$U2"
run_block unguarded
[ "$rc" != 0 ] && final_ok unguarded && same "$G1" && head_is_main && grep -q 'WARNING: main.s deploy.sh is unguarded or broken' "$out" &&
  ok "main's deploy.sh unguarded: pulled, guarded copy reinstalled, exit $rc + WARNING, stash untouched" || bad "unguarded"

# 2b. same, but nothing was parked (deploy.sh == HEAD, guarded) when main turns unguarded
world unguarded_clean
push_main "merge guarded deploy.sh" "$F" "$G1"
git -C "$oci" checkout -q -- "$F" && git -C "$oci" pull -q --ff-only origin main
push_main "unguarded change" "$F" "$U2"
run_block unguarded_clean
[ "$rc" != 0 ] && final_ok unguarded_clean && same "$G1" && head_is_main && grep -q 'nothing parked' "$out" && grep -q 'WARNING' "$out" &&
  ok "nothing parked, then main unguarded: the pre-pull copy is reinstalled, exit $rc" || bad "unguarded_clean"

# 2c. main ships a guarded but unparseable deploy.sh
world broken
push_main "broken" "$F" "$BROKEN"
run_block broken
[ "$rc" != 0 ] && final_ok broken && same "$G1" && grep -q 'WARNING' "$out" &&
  ok "main's deploy.sh guarded but bash -n fails: guarded copy reinstalled, exit $rc" || bad "broken"

# 3. main ships a NEWER guarded deploy.sh that differs from the parked one: keep main's (never roll back)
world newer
push_main "newer guarded" "$F" "$G2"
run_block newer
[ "$rc" = 0 ] && final_ok newer && same "$G2" && head_is_main && git -C "$oci" diff --quiet HEAD -- "$F" &&
  ok "main's newer guarded deploy.sh differs from the parked one: main's kept, no conflict, stash untouched" || bad "newer"

# 4. an untracked file that main ships blocks the fast-forward
world untracked
echo "local copy" >"$oci/src/lib/crawler/content-agency-parser.ts"
before_head=$(git -C "$oci" rev-parse HEAD)
push_main "ship parser + guarded deploy.sh" src/lib/crawler/content-agency-parser.ts 'shipped\n' "$F" "$G1"
run_block untracked
[ "$rc" != 0 ] && final_ok untracked && same "$G1" && [ "$(git -C "$oci" rev-parse HEAD)" = "$before_head" ] &&
  grep -q 'PULL REFUSED' "$out" && grep -q '^?? src/lib/crawler/content-agency-parser.ts' "$out" && grep -q 'untracked working tree files would be overwritten' "$out" &&
  [ "$(cat "$oci/src/lib/crawler/content-agency-parser.ts")" = "local copy" ] &&
  ok "untracked path main ships: pull refused (git's error shown), status printed, guarded copy back, exit $rc" || bad "untracked"

# 4b. a dirty tracked file that main also changes blocks the fast-forward
world dirty
echo "local edit" >>"$oci/src/lib/crawler/worker.ts"
before_head=$(git -C "$oci" rev-parse HEAD)
push_main "worker change + guarded deploy.sh" src/lib/crawler/worker.ts 'worker v2\n' "$F" "$G1"
run_block dirty
[ "$rc" != 0 ] && final_ok dirty && same "$G1" && [ "$(git -C "$oci" rev-parse HEAD)" = "$before_head" ] &&
  grep -q '^ M src/lib/crawler/worker.ts' "$out" && grep -q 'local edit' "$oci/src/lib/crawler/worker.ts" &&
  ok "dirty worker.ts that main changes: pull refused, worker.ts untouched, guarded copy back, exit $rc" || bad "dirty"

# 5. the operator stash is asserted untouched in every case above (final_ok); also: no new stash
# was ever created anywhere
for d in "$work"/*/oci; do [ "$(git -C "$d" stash list | wc -l | tr -d ' ')" = 1 ] || bad "stash count in $d"; done
ok "every repo still has exactly its one operator stash"

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
