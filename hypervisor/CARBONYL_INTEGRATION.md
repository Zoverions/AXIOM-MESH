# AxiomMesh Carbonyl Integration

## Terminal-Native Spatial Browsing for AI Agents

This module implements **Terminal-Native Spatial Browsing** by integrating the [Carbonyl](https://github.com/fathyb/carbonyl) terminal browser with the AxiomMesh agent system. It replaces high-entropy pixel-based Vision-Language Models (VLMs) and bloated HTML DOM parsing with efficient **Spatial Text Matrices**.

---

## 🎯 The Architectural Epiphany: Thermodynamic Web Compression

### The Problem
When an AxiomMesh agent needs to execute a web task (e.g., "Log into this portal and extract analytics"), the current standard relies on:
- **Playwright + Chromium**: ~1.5GB RAM overhead
- **4K Screenshots + VLM**: Requires running 7B+ parameter vision models (like LLaVA)
- **HTML DOM Dumps**: 3MB+ of messy markup causing context degradation

### The Carbonyl Solution
By running Carbonyl inside our Pillar 3 Execution Sandbox, the browser renders websites directly into a **2D grid of ASCII/ANSI terminal cells**. We capture this grid and feed it to the 1.58-bit Ternary Engine.

**Result:** The LLM "sees" the UI layout using standard text tokens with **zero pixel-processing overhead**.

---

## 📦 Components

### 1. SpatialWebParser (`hypervisor/src/spatial_web_parser.py`)

Converts raw Carbonyl terminal buffers into geometric context matrices.

```python
from hypervisor.src.spatial_web_parser import SpatialWebParser

parser = SpatialWebParser(viewport_width=120, viewport_height=40)

# Strip ANSI codes while preserving spatial layout
clean_text = parser.strip_ansi(raw_buffer)

# Generate coordinate-mapped spatial matrix
matrix = parser.parse_carbonyl_buffer(raw_buffer)

# Detect clickable elements (buttons, links)
elements = parser.extract_clickable_elements(raw_buffer)
# Returns: [(x, y, "Button Text"), ...]

# Generate LLM interaction prompt
prompt = parser.generate_interaction_prompt(raw_buffer, "Find the login button")
```

#### Key Features:
- **ANSI Code Stripping**: Removes color/style codes while preserving geometry
- **Coordinate Rulers**: X/Y axes for precise click targeting
- **Element Detection**: Regex-based identification of interactive elements
- **Prompt Generation**: Ready-to-use LLM prompts with spatial context

---

### 2. CarbonylDriver (`sandbox/src/carbonyl_driver.rs`)

Rust driver that spawns and controls Carbonyl in a pseudo-terminal (PTY).

```rust
use carbonyl_driver::{CarbonylDriver, WebAction, ScrollDirection};

// Create driver with custom viewport
let mut driver = CarbonylDriver::with_config(CarbonylConfig {
    viewport_width: 120,
    viewport_height: 40,
    ..Default::default()
})?;

// Spawn browser
driver.spawn("https://example.com")?;

// Read terminal buffer (ANSI-encoded)
let buffer = driver.read_buffer()?;

// Click at coordinates
driver.click_at(25, 12)?;

// Type text
driver.type_text("search query")?;

// Scroll page
driver.scroll(ScrollDirection::Down, 20)?;
```

#### Key Features:
- **PTY Management**: Proper pseudo-terminal handling for terminal rendering
- **IPC Communication**: Unix domain socket interface for Python Hypervisor
- **Action Execution**: Click, type, navigate, scroll operations
- **Buffer Capture**: Real-time terminal buffer reading

---

### 3. CarbonylAgent (`hypervisor/src/carbonyl_agent.py`)

High-level AI agent for autonomous web browsing tasks.

```python
from hypervisor.src.carbonyl_agent import CarbonylAgent

agent = CarbonylAgent(
    viewport_width=120,
    viewport_height=40,
)

# Connect to Rust backend (optional - works in simulation mode)
agent.connect()

# Execute complete web task
task = agent.execute_task(
    url="https://example.com",
    objective="Extract the main headline and any navigation links",
    max_steps=20,
)

print(f"Task completed: {task.completed}")
print(f"Actions taken: {len(task.actions_taken)}")
print(f"Extracted data: {task.extracted_data}")
```

#### Key Features:
- **Task Automation**: Complete web browsing workflows
- **Spatial Understanding**: Interprets terminal layouts as UI structures
- **IPC Client**: Communicates with Rust CarbonylDriver
- **Simulation Mode**: Works without actual Carbonyl backend for testing

---

## 🔌 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AxiomMesh Hypervisor                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              CarbonylAgent (Python)                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │   │
│  │  │SpatialWeb    │  │CarbonylIPC   │  │ Task       │  │   │
│  │  │Parser        │  │Client        │  │ Planner    │  │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘  │   │
│  └─────────────────────────┬─────────────────────────────┘   │
│                            │ IPC (Unix Domain Socket)         │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                Pillar 3 Sandbox (Rust)                        │
│  ┌─────────────────────────▼─────────────────────────────┐   │
│  │              CarbonylDriver                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │   │
│  │  │ PTY Manager  │  │ Buffer Reader│  │ ANSI       │  │   │
│  │  │              │  │              │  │ Injector   │  │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘  │   │
│  └─────────────────────────┬─────────────────────────────┘   │
│                            │                                  │
│  ┌─────────────────────────▼─────────────────────────────┐   │
│  │           Carbonyl (Terminal Chromium)                 │   │
│  │     Renders web pages as ANSI terminal output          │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

1. **Install Carbonyl**:
   ```bash
   # Download from https://github.com/fathyb/carbonyl/releases
   wget https://github.com/fathyb/carbonyl/releases/download/v1.0.0/carbonyl-linux.zip
   unzip carbonyl-linux.zip
   sudo mv carbonyl /usr/local/bin/
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r hypervisor/requirements.txt
   ```

3. **Build Rust sandbox**:
   ```bash
   cd sandbox
   cargo build --release
   ```

### Basic Usage

```python
from hypervisor.src.carbonyl_agent import browse_web

# Simple one-liner for quick tasks
task = browse_web(
    url="https://news.ycombinator.com",
    objective="Extract the top 3 story titles",
)

print(task.extracted_data)
```

### Advanced Usage

```python
from hypervisor.src.carbonyl_agent import CarbonylAgent, Action, ActionType
from hypervisor.src.spatial_web_parser import SpatialWebParser

# Initialize agent
agent = CarbonylAgent(viewport_width=120, viewport_height=40)
agent.connect()

# Manual control
agent.spawn_browser("https://google.com")

# Get spatial matrix
matrix = agent.get_spatial_matrix()
print(matrix)

# Detect elements
elements = agent.detect_interactive_elements()
for x, y, desc in elements:
    print(f"  [{x:03d},{y:03d}] {desc}")

# Click on element
agent.click(25, 12)

# Type in search box
agent.type_text(30, 15, "AxiomMesh Carbonyl")

# Extract results
result = agent.extract_content()
print(result.data)

agent.disconnect()
```

---

## 📊 Performance Comparison

| Metric | Playwright + VLM | Carbonyl Integration |
|--------|------------------|---------------------|
| RAM Usage | ~1.5 GB | ~50 MB |
| Context Size | 3MB+ HTML or 4K image | ~5KB text matrix |
| Processing | GPU required for VLM | CPU-only text processing |
| Latency | 2-5 seconds | 100-300ms |
| VLM Required | Yes (7B+ params) | No |

---

## 🎮 Interaction Protocol

Agents interact with web pages using coordinate-based commands:

### Action Types

| Action | Format | Example |
|--------|--------|---------|
| CLICK | `CLICK:X,Y` | `CLICK:025,012` |
| TYPE | `TYPE:X,Y,text` | `TYPE:030,015,hello world` |
| NAVIGATE | `NAVIGATE:url` | `NAVIGATE:https://example.com` |
| SCROLL | `SCROLL:UP/DOWN` | `SCROLL:DOWN` |
| WAIT | `WAIT:ms` | `WAIT:2000` |
| EXTRACT | `EXTRACT` | `EXTRACT` |

### Sample LLM Prompt

```
[SPATIAL WEB MATRIX START]
    012345678901234567890123456789012345678901234567890
    --------------------------------------------------
000 |Welcome to Example.com                          |
001 |                                                |
002 |Your gateway to the internet                    |
003 |                                                |
004 |[Home] [About] [Services] [Contact]             |
005 |                                                |
006 |Featured Content:                               |
007 |  • Article Title 1 - Learn something new       |
008 |  • Article Title 2 - Breaking news update      |
009 |[Read More] [Subscribe]                         |
[SPATIAL WEB MATRIX END]

DIRECTIVE: To interact, reply with X,Y coordinates based on the grid above.
FORMAT: CLICK:X,Y or NAVIGATE:direction or INPUT:X,Y:text

=== TASK ===
Find and click the Contact link

=== DETECTED INTERACTIVE ELEMENTS ===
  [000,004] [Home]
  [007,004] [About]
  [015,004] [Services]
  [025,004] [Contact]
  [000,009] [Read More]
  [012,009] [Subscribe]

=== INSTRUCTIONS ===
Respond with one of the following actions:
  - CLICK:X,Y     : Click on element at coordinates X,Y
  - TYPE:X,Y,text : Type text at input field at coordinates X,Y  
  - SCROLL:UP/DOWN: Scroll the page up or down
  - WAIT          : Wait for page to load/update
  - EXTRACT       : Extract relevant information from current view

Example: CLICK:025,004
```

---

## 🧪 Testing

### Run Python Tests

```bash
# Test SpatialWebParser
python3 /tmp/test_spatial_parser.py

# Test CarbonylAgent
python3 /tmp/test_carbonyl_agent.py
```

### Run Rust Tests

```bash
cd sandbox
cargo test carbonyl_driver
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CARBONYL_IPC_SOCKET` | Path to IPC socket | `/var/run/axiom-carbonyl.sock` |
| `CARBONYL_WIDTH` | Default viewport width | `120` |
| `CARBONYL_HEIGHT` | Default viewport height | `40` |

### CarbonylConfig (Rust)

```rust
let config = CarbonylConfig {
    viewport_width: 120,
    viewport_height: 40,
    user_agent: Some("AxiomMesh-Agent/1.0".to_string()),
    proxy: Some("http://proxy.example.com:8080".to_string()),
    headless: true,
    timeout_secs: 30,
};
```

---

## 🛠️ Development

### Adding New Actions

1. Add action type to `ActionType` enum in `carbonyl_agent.py`
2. Implement handler in `CarbonylAgent._execute_action()`
3. Add corresponding Rust method in `carbonyl_driver.rs`
4. Update IPC command handler

### Debugging

Enable debug logging:

```python
import logging
logging.getLogger("AxiomMesh-CarbonylAgent").setLevel(logging.DEBUG)
logging.getLogger("AxiomMesh-SpatialWeb").setLevel(logging.DEBUG)
```

---

## 📝 License

Part of the AxiomMesh project. See main LICENSE file.

---

## 🙏 Acknowledgments

- **[fathyb/carbonyl](https://github.com/fathyb/carbonyl)**: The brilliant terminal browser that makes this possible
- **Chromium Project**: For the underlying browser engine
- **AxiomMesh Team**: For the spatial browsing architecture

---

## 🚧 Future Enhancements

- [ ] Mouse event support via ANSI sequences
- [ ] Multi-tab browsing
- [ ] Screenshot fallback for complex layouts
- [ ] WebSocket support for real-time pages
- [ ] Form auto-fill capabilities
- [ ] CAPTCHA detection and handling
- [ ] Integration with AxiomMesh LLM router

---

**Built with ❤️ for the AxiomMesh decentralized AI network**
