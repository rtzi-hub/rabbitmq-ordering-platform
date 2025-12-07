#!/usr/bin/env bash
set -euo pipefail

kubectl delete ns apps messaging database --ignore-not-found=true
