# stitch CLI Demo
# Generate with: vhs demo.tape

Output demo.gif

# Terminal settings
Set Shell fish
Set FontSize 16
Set Width 1000
Set Height 600
Set Padding 20

# Border radius and margins
Set Margin 20
Set MarginFill "#1e1e2e"
Set BorderRadius 10

Set TypingSpeed 50ms
Set CursorBlink false

# Setup: Create alias for stitch
Hide
Type "alias stitch='bun /home/captainsafia/gh/stitch/src/cli.ts'"
Enter
Sleep 500ms
Type "cd /tmp && rm -rf stitch-demo && mkdir stitch-demo && cd stitch-demo"
Enter
Sleep 500ms
Type "git init && git config user.email 'demo@example.com' && git config user.name 'Demo User'"
Enter
Sleep 500ms
Type "clear"
Enter
Sleep 300ms
Show

# Title
Type "# 🧵 stitch: the intent log for agents and humans"
Sleep 1s
Enter
Sleep 500ms

# Initialize stitch
Type "stitch init"
Sleep 300ms
Enter
Sleep 1s

# Start a new stitch
Type "stitch start Implement user authentication"
Sleep 300ms
Enter
Sleep 1s

# Show status
Type "stitch status"
Sleep 300ms
Enter
Sleep 1s

# Create some code and commit
Type "echo 'export function login(user, pass) { }' > auth.js"
Enter
Sleep 300ms
Type "git add . && git commit -m 'Add login function'"
Enter
Sleep 800ms

# Link the commit
Type "stitch link --commit HEAD"
Sleep 300ms
Enter
Sleep 1s

# Create a child stitch for sub-task
Type "stitch child Add password validation"
Sleep 300ms
Enter
Sleep 1s

# Show the lineage
Type "stitch status"
Sleep 300ms
Enter
Sleep 1s

# List all stitches
Type "stitch list"
Sleep 300ms
Enter
Sleep 1s

# Add more code
Type "echo 'export function validatePassword(p) { return p.length >= 8; }' >> auth.js"
Enter
Sleep 300ms
Type "git add . && git commit -m 'Add password validation'"
Enter
Sleep 800ms
Type "stitch link --commit HEAD"
Enter
Sleep 800ms

# Show blame - the magic feature!
Type "stitch blame auth.js"
Sleep 300ms
Enter
Sleep 2s

# Final message
Type "# ✨ Every line knows its intent!"
Enter
Sleep 2s

