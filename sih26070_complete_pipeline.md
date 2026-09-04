# SIH26070 – Complete End-to-End Pipeline: Full Technical Walkthrough

> **Purpose**: A complete, step-by-step explanation of every stage of the cyclone AI system —  
> what data is used, what model/technique is applied, why it is used, and what output it produces.  
> Written so you can explain the full pipeline clearly to anyone — judges, mentors, or team.

---

## Big Picture: What We Are Building

We are building a **two-module AI system**:

- **Module 1 – Genesis Prediction**: Detects *where and when* a tropical cyclone might form, before it exists.
- **Module 2 – Main Analysis Pipeline**: Once a system is detected or forming, it classifies its structure, estimates intensity, predicts if it will rapidly intensify, and generates multi-path track forecasts with a probabilistic risk cone.

Both modules share the same underlying data infrastructure and feed into a unified final output.

---

## System Architecture: One-Line Summary per Stage

```
Raw Data → Preprocessing → Anomaly Fields + GPI →
Genesis Module (Swin-T) → Genesis Probability Map

                  ↓ (if system detected)

Sparse Satellite Frames (channel-stacked)
+ ERA5 Environmental Snapshot
  → Shared Swin-T Encoder (satellite)
  → FNO Encoder (environment)
  → Cross-Attention Fusion
  → BiFPN Multi-Scale Spatial Features
  → GRU Temporal Aggregation (2-3 frames)
  → [Intensity Head | RI Head | Dvorak/Pattern Head]
  → Track: CLIPER + NWP Steering + Analog Ensemble + XGBoost MOS
  → KDE Probabilistic Cone + Landfall Risk
  → MC Dropout Uncertainty + GradCAM Explainability
  → Final Output Dashboard
```

---

# PART 0: DATA FOUNDATION

## Step 0A: What Data We Collect

We collect data from four independent sources. Each serves a different role in the pipeline.

---

### Source 1: INSAT-3D / 3DR Satellite Imagery
**What it is**: India's own geostationary meteorological satellite.  
**What we download**: Three channels — Infrared (IR), Water Vapour (WV), and Visible (VIS).  
**What each channel tells us**:
- **IR (10.8 µm)**: Shows cloud-top temperature. Colder → higher cloud → more intense convection. The primary channel for cyclone analysis.
- **WV (6.8 µm)**: Shows mid-level moisture and upper-level dynamics. Critical for detecting dry air intrusion that weakens cyclones.
- **VIS (0.65 µm)**: Shows reflected sunlight — gives sharp detail of cloud texture, banding, eye structure. Only available during daytime.

**Temporal coverage**: Available every 30 minutes — but we do NOT need every frame. We extract **2–3 snapshots at 6-hour intervals** around the time of interest.

**Where to get it**: MOSDAC portal (mosdac.gov.in) — free institutional access.

**If INSAT is unavailable**: Fall back to EUMETSAT Meteosat data (same IR/WV/VIS bands, same wavelengths).

---

### Source 2: ERA5 Reanalysis (Copernicus Climate Data Store)
**What it is**: The gold-standard global atmospheric reanalysis dataset from ECMWF. It reconstructs the state of the atmosphere at every 6 hours going back to 1940, globally, at 0.25° (~28 km) resolution.

**What we download** (6-hourly snapshots):
| Variable | Pressure Level | Why It Matters |
|---|---|---|
| Sea Surface Temperature (SST) | Surface | Cyclone fuel — warm SST drives intensification |
| 850 hPa Relative Vorticity | Low-level | Spin-up signal for genesis |
| 200–850 hPa Vertical Wind Shear | Deep-layer | High shear = hostile environment |
| 500–700 hPa Relative Humidity | Mid-level | Moisture availability for convection |
| 200 hPa Divergence | Upper-level | Outflow — necessary for intensification |
| Ocean Heat Content (OHC) | 0–26°C isotherm depth | Deep warm water = sustained intensification fuel |
| 850 + 200 hPa winds (u, v) | Both levels | Steering flow for track prediction |
| Sea Level Pressure (SLP) | Surface | Cyclone center identification and anomaly detection |

**Also download**: Monthly climatological means (1991–2020) of the above fields for the Bay of Bengal and Arabian Sea.  
→ These are used to compute **anomaly fields** (see Step 0C).

**Where to get it**: `cdsapi` Python library → Copernicus CDS (free account).

---

### Source 3: IBTrACS (International Best Track Archive for Climate Stewardship)
**What it is**: NOAA's official archive of every tropical cyclone globally since ~1842. For North Indian Ocean, this gives us **~180–200 named cyclones from 1980 to 2024** with 6-hourly records of:
- Center position (lat, lon)
- Maximum sustained wind (Vmax in knots)
- Minimum central pressure (MSLP in hPa)
- Storm radius estimates (R34, R50, R64 — wind radii)
- Cyclone category / IMD classification

**Role in our system**:
1. **Ground truth labels** for training (intensity, position, category)
2. **Temporal sequence data** — each cyclone's 6-hourly records form a short time series we can pair with ERA5 snapshots
3. **Analog library** — the full set of historical tracks used for the analog ensemble track prediction

**Where to get it**: `tropycal` Python library — downloads IBTrACS with one function call.

---

### Source 4: GFS (Global Forecast System) Forecast Fields
**What it is**: NOAA's operational NWP (Numerical Weather Prediction) model. Runs 4 times daily, provides forecasts up to 16 days at 0.25° resolution.

**What we use**: The **+24h, +48h** forecast fields of the same ERA5 variables (SST, shear, vorticity, humidity, steering winds).

**Role**: Feed into the genesis lead-time stratification and provide the **NWP steering-flow track** in the track prediction module.

**Where to get it**: NCEP NOMADS server — free, updated 4x daily, no login needed.

---

## Step 0B: Building the Training Dataset

**How we pair data**:

```
For each historical NIO cyclone in IBTrACS (1990–2023):
  For each 6-hour time step t:
    1. Get cyclone state: (lat, lon, Vmax, MSLP, category) from IBTrACS at time t
    2. Fetch ERA5 fields at time t for the 20°×20° domain centered on the cyclone
    3. Fetch INSAT (or equivalent) satellite imagery at time t [if available]
    4. Also fetch t-6h fields and imagery [for the GRU 2-frame input]
    5. Store as one training sample
```

**Result**: ~5,000–7,000 training samples from ~180 cyclones.  
**Labels per sample**: Intensity (Vmax, MSLP), category (TD/TS/CS/SCS/VSCS/ESCS), RI flag (did Vmax increase >35 kt in next 24h?), track displacement (where did the center move in the next 6/12/24/48h).

---

## Step 0C: Computing Anomaly Fields

**What it is**: For every environmental variable, we subtract the monthly climatological mean.

```
SST_anomaly(t) = SST(t) - SST_climatology(month of t)
VWS_anomaly(t) = VWS(t) - VWS_climatology(month of t)
... (same for all 8 variables)
```

**Why**: The anomaly tells us "how unusual is this environment compared to what's normal for this time of year." A +2°C SST anomaly in November in the Bay of Bengal is a very strong genesis signal. The raw SST value (say, 28°C) alone is less informative because that's normal for the season.

**This is how we encode temporal information without a sequence**: The anomaly implicitly encodes "what has changed from the baseline state" — which is the physical precursor we care about.

**Implementation**: Simple NumPy subtraction. Climatologies are pre-downloaded from ERA5 (monthly means over 1991–2020 standard period).

---

## Step 0D: Computing Genesis Potential Index (GPI)

**What it is**: A physics-derived scalar index that measures how favorable the environment is for cyclone genesis, at every grid point.

**Formula** (Tippett et al. 2011 formulation):

```
GPI = |η|^3 × H^3 × (Vpot/70)^3 × (1 + 0.1 × Vshear)^(-2)

where:
  η     = 850 hPa absolute vorticity (spin-up)
  H     = 600 hPa relative humidity (moisture)
  Vpot  = Maximum potential intensity (computed from SST using Kerry Emanuel's formula)
  Vshear = 200-850 hPa vertical wind shear magnitude
```

**Output**: A 2D map (same grid as ERA5) where high values → favorable for genesis.

**Role**: This is added as an **extra input channel** alongside the anomaly fields. It encodes meteorological theory directly into the model's input — so the model learns from both physics (GPI) and data patterns simultaneously. This is the "physics-guided feature" that makes the model scientifically grounded.

**Implementation**: Pure NumPy/MetPy computation. No ML needed here.

---

# PART 1: MODULE 1 — GENESIS PREDICTION

## Step 1A: What We Are Trying to Do

Predict, *before a cyclone forms*, where and with what probability a cyclone might develop in the next 24–72 hours.

The output is a **Genesis Probability Map** — a 2D spatial map over the Bay of Bengal and Arabian Sea where each grid point has a probability (0–1) of cyclone genesis occurring nearby.

---

## Step 1B: Input Preparation for Genesis Module

We assemble a **multi-channel 2D spatial grid** over the region of interest:

```
Input tensor shape: (C, H, W)
where:
  C = 8 channels → [SST_anomaly, VWS_anomaly, Humidity_anomaly,
                     Vorticity_anomaly, Divergence_anomaly, OHC_anomaly,
                     SLP_anomaly, GPI]
  H × W = spatial grid (e.g., 80×80 at 0.25° over Bay of Bengal)
```

Each of the 8 channels is a 2D spatial field — it's like a multi-band satellite image where each band is a physical variable. This is exactly the format CNN/ViT models accept.

---

## Step 1C: The Genesis Model — Swin Transformer

**What is a Swin Transformer?**

Swin Transformer is a Vision Transformer variant designed for dense prediction tasks on spatial grids. Unlike a standard CNN that processes fixed-size patches, it processes data in **hierarchical shifted windows** — capturing both local detail and global context efficiently.

**Why Swin Transformer for genesis?**

- Our input is a multi-band 2D spatial field (like a satellite image with 8 channels) — exactly the input format ViTs handle
- We need to detect spatial patterns at multiple scales (local vorticity maxima AND large-scale moisture patterns) — Swin's hierarchical windows do this naturally
- Pre-trained Swin-T weights (from ImageNet) provide a strong initialization — we fine-tune rather than train from scratch

**Architecture for Genesis**:

```
Input: (8, 80, 80) multi-channel anomaly+GPI field

Step 1: Patch Embedding
  → Divide into 4×4 non-overlapping patches
  → Linear projection → (C_embed, 20, 20) feature map

Step 2: 4 Swin Transformer Stages (Tiny variant)
  → Stage 1: Local attention in 7×7 windows
  → Stage 2: Shifted windows (cross-window communication)
  → Stage 3: Further downsampling + attention
  → Stage 4: Global context
  → Output: (768, 5, 5) high-level feature map

Step 3: Genesis Head
  → Upsample back to (H, W) via bilinear interpolation
  → 1×1 Conv → Sigmoid activation
  → Output: (1, 80, 80) probability map, values in [0, 1]
```

**Training**:
- **Positive labels**: Grid points within 500 km of where a cyclone actually formed, 24–72h before genesis time (from IBTrACS)
- **Negative labels**: All other grid points
- **Loss**: Focal Loss (because genesis events are rare — class imbalance is severe)
- **Focal Loss** down-weights easy negative examples and focuses training on hard positives — critical when 99% of grid points are "no genesis"

---

## Step 1D: Lead-Time Stratification Without Sequences

We cannot train three separate time-horizon heads (24h/48h/72h) reliably without temporal sequences. Instead, we use **NWP forward-pass**:

```
Genesis_24h_map = Genesis_Model(current ERA5 anomaly fields)
Genesis_48h_map = Genesis_Model(GFS +24h forecast fields converted to anomalies)
Genesis_72h_map = Genesis_Model(GFS +48h forecast fields converted to anomalies)
```

We run the **same trained model** on different temporal snapshots of forecast fields. The GFS provides +24h, +48h forecast fields for free from NCEP NOMADS. This is operationally exactly what NWP forecasters do — "run the diagnostic on the forecast state."

---

## Step 1E: Output — Genesis Zones

High-probability regions (e.g., > 0.5) are extracted using **connected component labeling** (a computer vision technique). Each connected high-probability region is marked as a **Potential Genesis Zone** with:
- Center lat/lon
- Area (km²)
- Peak probability
- Lead time (24h / 48h / 72h)

This output is displayed on a map overlay and also passed as a trigger signal to Module 2.

---

# PART 2: MODULE 2 — MAIN ANALYSIS PIPELINE

## Trigger Condition

Module 2 activates when:
- A genesis zone from Module 1 crosses a probability threshold (e.g., > 0.6), **OR**
- IMD/JTWC officially designates a Low Pressure Area / Depression / Cyclone

Once triggered, Module 2 runs continuously at every 6-hour analysis cycle.

---

## Step 2-1: Input Preparation — Sparse Satellite Frames

**What we do**: Collect **2–3 satellite images at ~6-hour intervals** closest to the current analysis time.

```
Available frames (example):
  frame_t0   = INSAT image at 00:00 UTC (current)
  frame_t-6  = INSAT image at 18:00 UTC (6h ago)
  [frame_t-12 = INSAT image at 12:00 UTC (12h ago)] — if available
```

**Why only 2–3 and not more?**

In reality, INSAT provides 30-minute imagery, but:
1. Training data may not always have consistent dense sequences for all historical cyclones
2. Storage and download constraints during real-time operations
3. 2–3 frames at 6h intervals is **always available** from IBTrACS + MOSDAC archives

**Channel stacking**: Instead of processing frames as a sequence (which requires LSTM/Transformer over time), we **stack them along the channel dimension**:

```python
# Each frame: (3 channels: IR, WV, VIS) × (3 time steps)
satellite_input = torch.cat([
    ir_t0, wv_t0, vis_t0,       # 3 channels at t=0
    ir_t6, wv_t6, vis_t6,       # 3 channels at t=-6h
    ir_t12, wv_t12, vis_t12     # 3 channels at t=-12h (if available; else zero-pad)
], dim=0)
# Result: (9, H, W) tensor — like a 9-band satellite image
```

**Masked attention for missing frames**: If only 1 or 2 frames are available, the missing channels are zero-padded and a **binary availability mask** is passed to the encoder — it learns to ignore zero-padded channels.

**Spatial domain**: The input image is cropped to a **20°×20° box** centered on the estimated cyclone center.

**Preprocessing**:
- Normalize TB values to [0, 1] range (IR: 180K–310K, WV: 200K–280K)
- Resize to **256×256** pixels

---

## Step 2-2: Input Preparation — Environmental Snapshot

**What we do**: Extract the ERA5 (or GFS analysis) field snapshot at the current time, centered on the cyclone, same 20°×20° domain.

**Variables**:
```
env_input shape: (8, 80, 80)   [same channels as Genesis module, same grid]
Channels: SST, VWS, Mid-level Humidity, 850hPa Vorticity,
          200hPa Divergence, OHC, SLP, GPI
```

These are the **raw fields**, not anomalies — for the main pipeline we want the actual state values (e.g., actual wind shear magnitude matters for intensity estimation, not just the anomaly).

We also include the **SST spatial gradient** `∇SST` (computed with `numpy.gradient`) as a 10th channel — it captures warm pool boundaries, which are critical for track deflection.

---

## Step 2-3: Satellite Encoder — Shared Swin-T with Channel Adapters

**What we do**: Encode the 9-channel satellite input into a rich feature representation.

**Architecture**:

```
Input: (9, 256, 256) channel-stacked satellite tensor

→ Channel Adapter:
   A lightweight 1×1 Conv layer that projects (9, 256, 256) → (3, 256, 256)
   This adapter is specific to satellite data (separate from the env encoder)
   It learns to optimally mix channels from different time steps and bands

→ Pretrained Swin-T Backbone:
   Load SatMAE or W-MAE pretrained weights (pretrained on satellite imagery)
   Fine-tune on our cyclone data
   
   Swin-T stages: 2 → 4 → 8 → 16 transformer blocks
   Output feature maps: [C1, C2, C3, C4] at resolutions
   [64×64, 32×32, 16×16, 8×8] with channels [96, 192, 384, 768]
```

**Why pretrained SatMAE/W-MAE?**

SatMAE (Satellite Masked Autoencoder) is a ViT pretrained on large-scale satellite imagery using self-supervised Masked Autoencoding — it learns what satellite images look like at a deep feature level without needing labels. Starting from these weights means we need **far less labeled cyclone data** to fine-tune — critical since we only have ~180 cyclones.

**Why a shared backbone with adapters instead of separate Swin-T per channel?**

Three separate Swin-Ts would have ~87M × 3 = 261M parameters — too heavy for a student team to train. With a shared backbone + lightweight adapters:
- Shared backbone: ~28M parameters (Swin-T)
- 3 adapters × 100K parameters each = ~300K
- **Total: ~28.3M** — 90% fewer parameters, similar performance

---

## Step 2-4: Environmental Encoder — Fourier Neural Operator (FNO)

**What we do**: Encode the (10, 80, 80) environmental field snapshot.

**What is a Fourier Neural Operator?**

FNO is a neural network architecture designed specifically for **gridded physical fields** (like those in atmospheric science). Instead of applying convolution in the spatial domain (like CNNs do), it operates in the **Fourier/frequency domain**:

```
Input field → Fast Fourier Transform (FFT)
            → Multiply by learned spectral weights
            → Inverse FFT
            → + Local linear transform
            → Activation
            → Repeat × N layers
```

**Why FNO for environmental fields instead of Swin-T?**

- Atmospheric fields are governed by PDEs (Navier-Stokes, thermodynamics) — these are naturally expressed in Fourier space
- FNO captures **global-scale patterns** (the whole steering flow field) and **local features** (wind shear at the cyclone center) simultaneously in one operation
- FNO is more **parameter-efficient** than a Transformer for gridded physical data
- FNO is already used in operational weather forecasting (FourCastNet uses FNO blocks)

**Architecture**:

```
Input: (10, 80, 80) environmental fields

→ FNO Block 1: FFT → spectral filter (keep top 20 modes) → IFFT → Residual
→ FNO Block 2: Same
→ FNO Block 3: Same
→ FNO Block 4: Same
→ Output: (256, 80, 80) environmental feature map
→ Adaptive average pool → (256, 16, 16) [match satellite feature resolution]
```

---

## Step 2-5: Cross-Attention Fusion + Modality Gating

**What we do**: Merge the satellite features and environmental features into a single unified representation.

**Two-level fusion**:

### Level 1 — Local Fusion (Spatial Alignment)
Both the satellite encoder output and FNO output are at the same spatial resolution (16×16). We do an element-wise-aware alignment:

```
local_fused = Concat([satellite_feat_C3, env_feat]) along channel dim
            → Conv 1×1 → (512, 16, 16)
```

This aligns local patches — e.g., if there's high OHC directly below the eyewall, this fusion captures that co-occurrence.

### Level 2 — Global Fusion (Cross-Attention)
```
Q = global_avg_pool(satellite_feat_C4)  → (768,) query vector
K, V = global_avg_pool(env_feat)        → (256,) key-value vectors
Attention = softmax(Q·Kᵀ / √d) · V
```

This lets the model ask: "Given what I see in the satellite image (Q), what environmental features (K, V) are most relevant?"

### Modality Gating
A critical practical addition — handles missing/nighttime VIS channel:

```python
# Learned gates (output of a sigmoid MLP):
gate_sat = sigmoid(MLP(availability_flag))  # 0 if satellite unavailable
gate_env = 1 - gate_sat * 0.3              # environment always has some weight

fused_output = gate_sat * local_fused + gate_env * env_feat_upsampled
```

If it's nighttime and VIS is missing, the gate automatically downweights the satellite contribution and upweights the environmental features.

**Output**: Fused feature tensor (512, 16, 16)

---

## Step 2-6: BiFPN — Multi-Scale Spatial Feature Extraction

**What we do**: Extract cyclone structure features at multiple spatial scales simultaneously.

**Why multi-scale?**

A cyclone has relevant structure at many scales:
- Fine scale (5–50 km): Eyewall convection, inner spiral bands
- Mesoscale (100–500 km): CDO, outer rainbands, moat
- Synoptic scale (500–2000 km): Environmental steering, outer circulation

A standard single-scale feature extractor would miss one of these.

**What is BiFPN?**

BiFPN (Bidirectional Feature Pyramid Network) is the feature fusion architecture from Google's EfficientDet object detector. It takes multi-scale feature maps from the encoder and fuses them **bidirectionally** (both top-down and bottom-up) with learnable weights:

```
From Swin-T encoder, we already have multi-scale maps:
  P3: (96,  64, 64)   ← fine scale, eyewall detail
  P4: (192, 32, 32)
  P5: (384, 16, 16)
  P6: (768, 8,  8)    ← coarse scale, large-scale environment

BiFPN:
  Top-down pass:   P6 → P5 → P4 → P3  (coarse to fine: context flows down)
  Bottom-up pass:  P3 → P4 → P5 → P6  (fine to coarse: detail flows up)
  
  At each fusion node:
    P4_fused = w1*P4 + w2*resize(P5) + w3*resize(P3)  / (w1+w2+w3)
    [weights w1,w2,w3 are LEARNED — model decides which scale to trust]

Output: Enhanced P3, P4, P5, P6 feature maps
```

**Result**: Each feature map now contains both fine-grained and coarse-grained cyclone structure information — perfect for Dvorak pattern recognition and intensity estimation.

---

## Step 2-7: GRU Temporal Aggregation

**What we do**: If we have 2–3 sparse satellite frames, extract time-aware features using a lightweight GRU.

**Why GRU and not Transformer?**

- GRU (Gated Recurrent Unit) is a simplified LSTM — 2/3 fewer parameters, just as effective for short sequences
- Handles variable-length input (1, 2, or 3 frames) natively
- O(L) complexity — fast inference
- A full Temporal Transformer would be O(L²) and overkill for L=2 or 3

**Architecture**:

```
For each time step (t-12h, t-6h, t0):
  → Global average pool the BiFPN P6 feature map → (768,) vector
  
Then pass the sequence of vectors through GRU:

  [feat_t12, feat_t6, feat_t0] → GRU(hidden=512, layers=2) → hidden_state

hidden_state = (512,) vector encoding temporal dynamics across the 2-3 frames
```

**What the GRU learns**:
- Is the CDO growing or shrinking between frames? (organization trend)
- Is the cloud-top temperature getting colder? (convective intensification)
- Is the banding structure becoming more symmetric? (maturation signal)

**Graceful degradation**: If only 1 frame exists, we pass a single-element sequence — GRU simply outputs the encoding of that one frame. No crash, no special handling needed.

**Output**: 512-dimensional temporal context vector

---

## Step 2-8: Dvorak-Inspired Auxiliary Supervision

**What this is**: A training-time auxiliary loss that teaches the model to recognize Dvorak cloud patterns.

**What is the Dvorak Technique?**

The Dvorak technique (developed 1975) is the standard method IMD uses to estimate cyclone intensity from satellite imagery by identifying cloud patterns. Key patterns:
- **Banding**: Curved spiral bands feeding into the center — early organization stage
- **CDO (Central Dense Overcast)**: A large cold cloud mass — well-organized but no eye
- **Ragged Eye**: An asymmetric or partial eye — intensifying
- **Clear Eye**: A fully formed, symmetric, warm eye — peak intensity

**Our Implementation — Pixel-Wise Segmentation Head**:

```
Input: BiFPN P3 feature map (fine scale, 64×64)

→ UNet-style decoder:
   Upsample to 128×128 → Conv → Upsample to 256×256 → Conv → 1×1 Conv
   → Output: (7, 256, 256) logits
   
7 classes:
  0: Background
  1: Banding Features
  2: Central Dense Overcast (CDO)
  3: Eye Wall
  4: Eye (clear)
  5: Ragged/Irregular Eye
  6: Shear Pattern (asymmetric, cyclone being torn apart by shear)
```

**T-Number Regression Head**:
```
BiFPN P6 global features → MLP(256, 64, 1) → Sigmoid × 7 + 1.0
→ Output: T-number in [1.0, 8.0]
```

The Dvorak T-number directly maps to intensity (T1.0 = 25kt, T8.0 = 170kt). Having an explicit T-number output means **IMD forecasters immediately understand the output** — they use T-numbers daily.

**Training Labels for Segmentation**:
- We do NOT have hand-labeled segmentation masks (nobody does at scale).
- We generate **pseudo-labels** using thresholding:
  - Pixels with TB < 220K → potential eyewall/CDO
  - Spiral structure detected using Hough Transform → banding label
  - Local warm region inside CDO → eye label
- These are noisy but good enough for auxiliary supervision — the main task losses dominate.

**Loss for Segmentation**: `Dice Loss + Cross-Entropy Loss` (equally weighted)

**Loss for T-number**: `Huber Loss` (robust to outliers from noisy pseudo-labels)

**Important**: These are **auxiliary losses** only — they shape the features learned by BiFPN, making them Dvorak-aware. The segmentation output is also used in the final visualization.

---

## Step 2-9: Multi-Task Prediction Heads

All prediction heads receive the same input: the **combined feature vector**:

```python
features = Concat([
    GRU_hidden_state,          # (512,) — temporal dynamics
    BiFPN_P6_global_pool,      # (768,) — spatial cyclone structure
    env_global_features        # (256,) — environmental state
])
# Total: (1536,) feature vector
```

---

### Head A: Intensity Estimation

**Goal**: Predict current intensity as both a classification and regression problem.

```
features → MLP(1536, 512, 128) → Dropout(0.3)
         → Branch 1: MLP(128, 6) + Softmax
                     → IMD Category probabilities
                        [TD, TS, CS, SCS, VSCS, ESCS]
         
         → Branch 2: MLP(128, 2) + Physical constraint
                     → [Vmax (knots), MSLP (hPa)]
```

**Physics Constraint on Loss**:

Vmax and MSLP are not independent — they follow the **Wind-Pressure Relationship (WPR)** for the North Indian Ocean basin:

```
MSLP_predicted ≈ 1010 - (Vmax/6.3)^2  [Indian Ocean basin approximation]
```

We add a penalty term to the loss if the predicted Vmax and MSLP violate this relationship:

```python
wpr_loss = MSE(mslp_pred, 1010 - (vmax_pred/6.3)**2)
total_loss += 0.1 * wpr_loss
```

This is "physics-constrained learning" — the model cannot predict 150kt winds with 990 hPa pressure.

**Training labels**: IBTrACS Vmax and MSLP at each time step.
**Losses**: CrossEntropy (category) + Huber (Vmax) + Huber (MSLP) + WPR penalty.

---

### Head B: Rapid Intensification (RI) Detector

**Goal**: Binary classification — will this cyclone intensify by ≥35 kt in the next 24 hours?

**Why a separate head?**

RI is the most dangerous phenomenon (caught Odisha, West Bengal completely off-guard with Cyclone Amphan). It also has a **different feature signature** from general intensity — it's driven by:
- Eyewall symmetry (from satellite)
- Low wind shear AND warm OHC simultaneously
- Outflow efficiency

```
features → MLP(1536, 256, 64) → Sigmoid
         → P(RI in next 24h)  [0, 1]
```

**Training labels**: From IBTrACS — compute ΔVmax from t to t+4 (4 × 6h steps = 24h). Label = 1 if ΔVmax ≥ 35 kt.

**Class imbalance**: RI events are ~15–20% of all cases. Use **weighted BCE loss** or **focal loss** to prevent the model from predicting "no RI" always.

**Extra engineered features for RI** (appended to the 1536-d feature vector):
```python
ri_features = [
    ohc_value,                  # Ocean Heat Content at storm center (point lookup)
    vws_magnitude,              # Wind shear at storm center
    cdo_roundness_score,        # Computed from Dvorak segmentation output
    outflow_symmetry_score,     # From WV channel — entropy of upper cloud distribution
    dt_number,                  # Current T-number from Head D
]
```

These are **physically motivated** — exactly the features a Dvorak analyst uses to assess RI potential.

---

### Head C: Dvorak Pattern Classification

**Goal**: Classify the current cyclone into one of 6 organizational stages.

```
Dvorak Pattern Classes:
  1. Pre-organization (curved band, disorganized)
  2. Banding Feature (CF/BF) — organized banding, no CDO
  3. CDO (Central Dense Overcast) — organized but no eye
  4. Eye — clear eye present, peak organization
  5. Deteriorating (eye filling, becoming asymmetric)
  6. Shear Pattern (being torn apart by environmental shear)
```

```
features + segmentation_map_pooled → MLP(1536+128, 256, 6) → Softmax
→ Pattern class probabilities + T-number (from auxiliary head)
```

**Transition Constraint**: Add a soft loss that penalizes impossible Dvorak transitions:

```python
# Transition probability matrix (from meteorological knowledge):
# CDO → Eye is valid (prob ~0.7)
# Eye → Pre-organization is invalid (prob ~0.0)
transition_loss = -log(T[prev_class, pred_class])
total_loss += 0.05 * transition_loss
```

**Why this matters for SIH**: This head directly mirrors the IMD operational workflow. When the system says "Pattern: CDO → Eye forming" with a T-number, an IMD forecaster immediately understands it.

---

# PART 3: TRACK PREDICTION

## Step 3-1: What We Need to Track-Predict

Given:
- Current cyclone center position (lat0, lon0)
- Previous center position 6h ago (lat-6, lon-6) → gives us current motion vector
- Current intensity (Vmax)
- Environmental fields (steering flow)

Predict:
- Most likely track for next 6h, 12h, 24h, 48h
- An ensemble of plausible tracks (multi-path)
- A probabilistic cone (uncertainty region)

---

## Step 3-2: Layer 1 — CLIPER (Climatology and Persistence) Baseline

**What it is**: The simplest possible baseline — persists the current motion and adjusts using historical climatological track tendencies.

```python
# Current motion vector (from last 2 positions)
dlat_dt = (lat0 - lat_6h) / 6   # degrees per hour
dlon_dt = (lon0 - lon_6h) / 6

# CLIPER: Persist this motion + basin climatological beta drift
for t in [6, 12, 18, 24, 30, 36, 42, 48]:  # hours ahead
    lat_t = lat0 + dlat_dt * t + beta_drift_lat(lat0, t)
    lon_t = lon0 + dlon_dt * t + beta_drift_lon(lat0, t)
```

`beta_drift` is the tendency of cyclones to move poleward and westward due to Earth's curvature (beta-effect). Computed from historical IBTrACS track statistics by basin, month, and latitude.

**Why include this?** CLIPER is IMD's own operational baseline. If your system can't beat CLIPER, it has no value. This sets the bar.

---

## Step 3-3: Layer 2 — NWP Steering Flow Track

**What it is**: Use the actual atmospheric wind field to physically advect the cyclone.

**Concept**: Cyclones move (roughly) with the **deep-layer mean wind** — the pressure-weighted average wind between 850 and 200 hPa over a radius of ~3–5° around the center. This is called the "steering flow."

```python
# Extract steering layer wind from GFS at storm center
u_steer = area_mean(gfs_u_850_200hPa, lat0, lon0, radius=5deg)
v_steer = area_mean(gfs_v_850_200hPa, lat0, lon0, radius=5deg)

# Advect cyclone along steering flow
for t in [6, 12, ..., 48]:
    lat_t = lat0 + v_steer * t * (dt/earth_radius)
    lon_t = lon0 + u_steer * t * ...
    
    # Update steering wind at each step (re-extract from GFS at new position)
    u_steer, v_steer = area_mean(gfs_field_at_+t, lat_t, lon_t, radius=5deg)
```

This is a **4D advection scheme** — physically accurate, no ML needed.

**This alone gives a single deterministic track. Better than CLIPER for 12–48h lead times.** We use this as the "best guess" center track.

---

## Step 3-4: Layer 3 — Analog Ensemble (Multi-Path Generation)

**Goal**: Generate 10–15 plausible alternative tracks to represent uncertainty.

**What is the Analog Ensemble?**

Find historical cyclones from IBTrACS that were in a **similar situation** and use their track deviations from their NWP-predicted track as perturbations.

**Similarity Metric**: For each historical cyclone snapshot in IBTrACS, compute a similarity score:

```python
similarity = (
    w1 * position_distance_score(lat0, lon0, hist_lat, hist_lon) +
    w2 * intensity_similarity(vmax0, hist_vmax) +
    w3 * motion_similarity(dlat_dt, dlon_dt, hist_dlat, hist_dlon) +
    w4 * steering_flow_similarity(
           current_850hPa_field, hist_850hPa_field,
           method='cosine_similarity_of_flattened_grids'
    )
)
```

Select the **k=10 most similar** historical snapshots. For each one, compute:

```python
# How did the actual track deviate from what NWP predicted, at this analog time?
analog_deviation_t = actual_track[t] - nwp_predicted_track[t]
```

Apply these 10 deviations as perturbations to our current NWP steering track:

```python
ensemble_tracks = []
for analog in top_10_analogs:
    perturbed_track = [nwp_track[t] + analog_deviation[t] for t in lead_times]
    ensemble_tracks.append(perturbed_track)
```

**Result**: 10 tracks, each physically plausible because they're based on real historical cases in similar situations. This is the **multi-path output**.

---

## Step 3-5: Layer 4 — XGBoost Bias Correction (MOS)

**What it is**: A Model Output Statistics (MOS) layer that corrects systematic biases in our track prediction.

**Why**: Every track prediction method has systematic biases. For example, NWP steering flow tends to be slow in the Western Bay of Bengal. CLIPER tends to underpredict recurvature. These biases are learnable.

**Features for XGBoost**:

```python
xgb_features = {
    'vmax': current_vmax,
    'heading': current_heading_degrees,
    'speed': current_translation_speed,
    'lat': current_lat,
    'lon': current_lon,
    'u_steer': steering_u,
    'v_steer': steering_v,
    'vws': wind_shear_magnitude,
    'sst': sst_at_center,
    'ohc': ohc_at_center,
    'month': month_of_year,
    'basin': 0_for_BoB_1_for_AS,
    'nwp_error_prev_6h': previous_6h_track_error   # autocorrelated
}
```

**Training**: Pairs of (features, actual track error vs. NWP) from IBTrACS + historical ERA5.

**Inference**:
```python
bias_correction = xgb_model.predict(xgb_features)   # [Δlat, Δlon] per lead time
corrected_track = nwp_track + bias_correction
```

This is lightweight (XGBoost runs in milliseconds) and often improves track accuracy by 10–20%.

---

## Step 3-6: Probabilistic Cone Generation — KDE

**Input**: 10 ensemble track positions at each lead time (6h, 12h, 24h, 36h, 48h).

**Method**: Kernel Density Estimation (KDE) in 2D.

```python
from sklearn.neighbors import KernelDensity
import shapely.geometry as sg

cone_contours = {}
for t in [6, 12, 24, 36, 48]:
    # Stack the 10 analog track positions at lead time t
    positions = np.array([(track[t].lat, track[t].lon) 
                          for track in ensemble_tracks])  # (10, 2)
    
    # Fit 2D KDE
    kde = KernelDensity(kernel='gaussian', bandwidth=0.5)
    kde.fit(positions)
    
    # Extract contours at 50%, 75%, 90% probability mass
    contours_50 = extract_contour(kde, level=0.50)   # inner cone
    contours_90 = extract_contour(kde, level=0.90)   # outer cone
    
    cone_contours[t] = {'inner': contours_50, 'outer': contours_90}
```

**Intensity fading**: Cone width increases exponentially with lead time (uncertainty grows):

```python
cone_width_scale = base_width * exp(0.04 * lead_time_hours)
```

**Landfall Risk**:
```python
import geopandas as gpd

# Load Indian coastline with district boundaries (freely available from Survey of India)
coast = gpd.read_file('india_districts_coastal.shp')

# Intersect 90% cone with coastal districts
at_risk = coast[coast.geometry.intersects(cone_90pct.geometry)]
for district in at_risk:
    risk_prob = compute_intersection_fraction(cone_kde, district.geometry)
```

Output: Each coastal district gets a **landfall probability** (0–100%).

---

# PART 4: POST-PROCESSING AND OUTPUT

## Step 4A: Uncertainty Quantification — MC Dropout

**What it is**: A technique to estimate **model uncertainty** — how confident the model is in its own predictions.

**How MC Dropout works**:

During normal training, dropout randomly deactivates neurons to prevent overfitting. Usually, dropout is turned OFF during inference. With MC Dropout, we **keep dropout ON during inference** and run the model N=30 times:

```python
model.train()   # Keep dropout active
predictions = []
for _ in range(30):
    pred = model(satellite_input, env_input)
    predictions.append(pred)

mean_pred = np.mean(predictions, axis=0)
uncertainty = np.std(predictions, axis=0)    # High std = uncertain
```

**Output**:
- Intensity: `Vmax = 95kt ± 12kt` (mean ± std over 30 runs)
- RI probability: `0.73 ± 0.09`
- Pattern: `CDO (87% ± 5%)`

**Why this matters for IMD**: Uncertainty quantification tells forecasters when to trust the model and when to use their own judgment. A forecast of "RI probability = 0.73 ± 0.30" (high uncertainty) is very different from "0.73 ± 0.03" (confident).

---

## Step 4B: Output Calibration — Temperature Scaling

**Problem**: Neural networks are often overconfident — they output 98% probability when the true frequency is closer to 75%.

**Solution**: After training, fit a single scalar parameter T (temperature) on a validation set:

```python
calibrated_probability = softmax(logits / T)
```

T > 1 → softens probabilities (less confident)
T < 1 → sharpens probabilities

This single-parameter calibration is applied to all classification outputs (pattern, RI, category). Validated by plotting a **reliability diagram** (predicted prob vs. actual frequency) — should be close to the diagonal.

---

## Step 4C: Explainability — GradCAM on Satellite Image

**What it is**: A technique that shows which regions of the satellite image the model focused on to make its prediction.

**How it works**:

```python
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image

# Target the last convolutional layer in the Swin-T encoder
cam = GradCAM(model=satellite_encoder, target_layers=[swin_layer4])

# Generate attention heatmap for the intensity prediction
grayscale_cam = cam(input_tensor=satellite_input, target_category=intensity_class)

# Overlay on the IR satellite image
visualization = show_cam_on_image(ir_image_normalized, grayscale_cam)
```

**Output**: A satellite image with a heatmap overlay showing "the model is focusing on the eyewall region and CDO boundary to make this intensity prediction."

**Why this is critical for SIH demo**: It directly answers the judge's most common question — "why should we trust this model?" The GradCAM shows the model is looking at the right physical structures.

---

## Step 4D: Verification Module

**What it is**: An automated metrics computation module that evaluates system performance on historical cases.

**Metrics computed**:

```python
# Track Skill
track_MAE_24h = mean(|predicted_position_24h - actual_position_24h|)  # in km
track_MAE_48h = ...

# Intensity Skill
intensity_MAE = mean(|predicted_vmax - actual_vmax|)  # in knots
intensity_bias = mean(predicted_vmax - actual_vmax)   # positive = overestimate

# RI Skill
ri_bss = brier_skill_score(ri_probs, ri_labels)  # vs. climatological RI rate

# Genesis Skill
genesis_bss = brier_skill_score(genesis_probs, genesis_labels)

# Cone Skill
cone_capture_rate = fraction_of_actual_tracks_within_90pct_cone
```

**These numbers are shown in the demo** — demonstrating your system is quantitatively better than baselines.

---

## Step 4E: Final Output — What the System Produces

Every 6 hours, the system produces:

```
┌─────────────────────────────────────────────────────────────────────────┐
│               CYCLONE ANALYSIS BULLETIN                                 │
│          [System: SIH26070-AI]  [Valid: 00 UTC 04-Sep-2026]             │
├─────────────────────────────────────────────────────────────────────────┤
│ CYCLONE STATUS:                                                         │
│   Pattern: CDO (Central Dense Overcast)  →  T-number: 3.5              │
│   Confidence: 87% ± 4%                                                  │
│                                                                         │
│ CURRENT INTENSITY:                                                      │
│   Vmax: 75 kt ± 8 kt  |  MSLP: 979 hPa ± 4 hPa                        │
│   IMD Category: Severe Cyclonic Storm (SCS)                             │
│                                                                         │
│ ⚠️  RAPID INTENSIFICATION ALERT:                                        │
│   RI Probability (next 24h): 68% ± 11%   [ELEVATED — MONITOR CLOSELY] │
│                                                                         │
│ TRACK FORECAST (most likely path):                                      │
│   +06h: 14.5°N, 87.2°E    +24h: 16.8°N, 86.1°E                       │
│   +12h: 15.2°N, 86.9°E    +48h: 19.5°N, 85.3°E (near landfall)       │
│                                                                         │
│ LANDFALL PROBABILITY (coastal districts):                               │
│   Puri (Odisha): 62%  |  Srikakulam (AP): 48%  |  Ganjam: 41%         │
│                                                                         │
│ GENESIS ZONES (next 48h):                                               │
│   Region: 10–14°N, 82–88°E  |  Prob: 34%  [Low — monitor]            │
└─────────────────────────────────────────────────────────────────────────┘
```

**Visual Dashboard** (Plotly/Dash or Streamlit):
1. **Main map**: IR satellite image + cyclone center + multi-path tracks + probabilistic cone (shaded by probability)
2. **Intensity timeline**: Current + 48h intensity forecast with uncertainty bands
3. **Dvorak pattern panel**: Segmentation overlay on satellite image
4. **GradCAM panel**: Heatmap showing what the model focused on
5. **Genesis map**: Bay of Bengal/Arabian Sea probability overlay
6. **Skill metrics sidebar**: Live track error, intensity error vs. historical baselines

---

# SUMMARY: Complete Data & Model Flow

```
ERA5 Fields (6-hourly)
  + IBTrACS (best track)
  + INSAT-3D (sparse: 2-3 frames)
  + GFS Forecast (+24/+48h)
         │
         ▼
 [Preprocessing]
  Anomaly computation, GPI calculation,
  channel normalization, domain cropping
         │
         ├──────────────────────────────────────┐
         ▼                                      ▼
[Module 1: Genesis]                   [Module 2: Main Pipeline]
Swin-T on anomaly+GPI fields          (activated when system detected)
→ Genesis probability map                      │
→ NWP forward-pass lead-times                  ├─[Satellite Encoder]
→ Genesis zones flagged                        │   Shared Swin-T + adapters
                                               │   on channel-stacked frames
                                               │
                                               ├─[Environment Encoder]
                                               │   FNO on ERA5 snapshot
                                               │
                                               ├─[Cross-Attention Fusion]
                                               │   + Modality gating
                                               │
                                               ├─[BiFPN]
                                               │   Multi-scale spatial features
                                               │
                                               ├─[GRU]
                                               │   Lightweight temporal (2-3 frames)
                                               │
                                               ├─[Intensity Head] → Vmax, MSLP, Category
                                               ├─[RI Head]        → P(RI in 24h)
                                               ├─[Pattern Head]   → Dvorak class + T-number
                                               └─[Track Module]
                                                   Layer 1: CLIPER
                                                   Layer 2: NWP Steering
                                                   Layer 3: Analog Ensemble (k=10)
                                                   Layer 4: XGBoost Bias Correction
                                                   → KDE Cone
                                                   → Landfall district risk
                                                        │
                                                        ▼
                                               [MC Dropout UQ]
                                               [Temperature Scaling Calibration]
                                               [GradCAM Explainability]
                                               [Verification Metrics]
                                                        │
                                                        ▼
                                               [Final Bulletin + Dashboard]
```
