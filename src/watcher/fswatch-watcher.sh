#!/bin/bash
HOME_DIR="$1"

fswatch "${HOME_DIR}" -x --event-flag-separator "#"
