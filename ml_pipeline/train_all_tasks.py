import os
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import mean_absolute_error, mean_squared_error, accuracy_score, f1_score, roc_auc_score, confusion_matrix
import math

class CycloneDataset(Dataset):
    def __init__(self, data, task):
        self.data = data.dropna(subset=self.get_required_cols(task)).reset_index(drop=True)
        self.task = task
        
        # Features
        if task in ['intensity', 'category']:
            feat_cols = ['lat', 'lon', 'vmax_t-6h', 'vmax_t-12h', 'mslp_t-6h', 'delta_lat', 'delta_lon', 'month']
        elif task == 'ri':
            feat_cols = ['lat', 'lon', 'vmax_t-6h', 'vmax_t-12h', 'mslp_t-6h', 'delta_lat', 'delta_lon', 'month', 'vmax']
        elif task == 'track':
            feat_cols = ['lat', 'lon', 'vmax', 'mslp', 'delta_lat', 'delta_lon', 'month']
        elif task == 'tnumber':
            feat_cols = ['vmax', 'mslp', 'imd_category']
            
        # Impute missing with 0 for simplicity if any
        self.X = self.data[feat_cols].fillna(0).values
        
        # Targets
        if task == 'intensity':
            self.y = self.data['vmax'].values
        elif task == 'category':
            self.y = self.data['imd_category'].values
        elif task == 'ri':
            self.y = self.data['ri_label'].values
        elif task == 'track':
            self.y = self.data[['lat_t+12h', 'lon_t+12h']].values
        elif task == 'tnumber':
            # Dvorak CI to vmax approx: vmax = 14 * T - 8 for T >= 1.0
            # Roughly T = (vmax + 8) / 14
            self.y = ((self.data['vmax'] + 8) / 14.0).clip(1.0, 8.0).values
            
        # Normalize features roughly
        self.X_mean = np.mean(self.X, axis=0)
        self.X_std = np.std(self.X, axis=0) + 1e-6
        self.X = (self.X - self.X_mean) / self.X_std

    def get_required_cols(self, task):
        if task == 'intensity': return ['lat', 'lon', 'vmax_t-6h', 'vmax_t-12h', 'mslp_t-6h', 'delta_lat', 'delta_lon', 'month', 'vmax']
        if task == 'category': return ['lat', 'lon', 'vmax_t-6h', 'vmax_t-12h', 'mslp_t-6h', 'delta_lat', 'delta_lon', 'month', 'imd_category']
        if task == 'ri': return ['lat', 'lon', 'vmax_t-6h', 'vmax_t-12h', 'mslp_t-6h', 'delta_lat', 'delta_lon', 'month', 'vmax', 'ri_label']
        if task == 'track': return ['lat', 'lon', 'vmax', 'mslp', 'delta_lat', 'delta_lon', 'month', 'lat_t+12h', 'lon_t+12h']
        if task == 'tnumber': return ['vmax', 'mslp', 'imd_category']

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return torch.tensor(self.X[idx], dtype=torch.float32), torch.tensor(self.y[idx], dtype=torch.float32 if self.task != 'category' else torch.long)


class MLP(nn.Module):
    def __init__(self, in_dim, out_dim, is_classification=False):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, out_dim)
        )
    def forward(self, x):
        return self.net(x)

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371  # km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def train_and_eval(task, train_loader, test_loader, in_dim, out_dim, epochs=10):
    model = MLP(in_dim, out_dim)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    if task == 'intensity' or task == 'tnumber':
        criterion = nn.HuberLoss()
    elif task == 'category':
        criterion = nn.CrossEntropyLoss()
    elif task == 'ri':
        # Simple BCE since we're keeping it basic for now
        criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([10.0]))
    elif task == 'track':
        criterion = nn.MSELoss()
        
    print(f"--- Training {task} ---")
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        for X, y in train_loader:
            optimizer.zero_grad()
            out = model(X)
            if task == 'ri':
                loss = criterion(out.squeeze(), y)
            elif task == 'category':
                loss = criterion(out, y)
            else:
                loss = criterion(out.squeeze(), y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        if (epoch+1) % 5 == 0:
            print(f"Epoch {epoch+1}, Loss: {total_loss/len(train_loader):.4f}")
            
    # Eval
    model.eval()
    preds, true = [], []
    with torch.no_grad():
        for X, y in test_loader:
            out = model(X)
            if task == 'category':
                preds.extend(torch.argmax(out, dim=1).numpy())
            elif task == 'ri':
                preds.extend(torch.sigmoid(out).squeeze().numpy())
            else:
                preds.extend(out.squeeze().numpy())
            true.extend(y.numpy())
            
    preds = np.array(preds)
    true = np.array(true)
    
    print(f"FINAL TEST METRICS for {task}:")
    if task == 'intensity' or task == 'tnumber':
        print(f"MAE: {mean_absolute_error(true, preds):.4f}")
        print(f"RMSE: {np.sqrt(mean_squared_error(true, preds)):.4f}")
    elif task == 'category':
        print(f"Accuracy: {accuracy_score(true, preds):.4f}")
        print(f"F1-macro: {f1_score(true, preds, average='macro'):.4f}")
        within_1 = np.abs(true - preds) <= 1
        print(f"Within-1 Accuracy: {np.mean(within_1):.4f}")
    elif task == 'ri':
        pred_labels = (preds >= 0.5).astype(int)
        cm = confusion_matrix(true, pred_labels)
        if cm.shape == (2,2):
            tn, fp, fn, tp = cm.ravel()
            pod = tp / (tp + fn + 1e-6)
            far = fp / (tp + fp + 1e-6)
            csi = tp / (tp + fp + fn + 1e-6)
            auc = roc_auc_score(true, preds)
            print(f"POD: {pod:.4f}, FAR: {far:.4f}, CSI: {csi:.4f}, AUC-ROC: {auc:.4f}")
        else:
            print("Not enough classes in predictions for RI.")
    elif task == 'track':
        # Evaluate distance
        dists = []
        for i in range(len(preds)):
            dist = haversine_distance(true[i][0], true[i][1], preds[i][0], preds[i][1])
            dists.append(dist)
        print(f"Mean Track Error (12h): {np.mean(dists):.2f} km")

def main():
    data_path = '/Users/admin/Documents/Cyclone_Project/ml_pipeline/data/ibtracs_nio.csv'
    if not os.path.exists(data_path):
        print("Data not found!")
        return
        
    df = pd.read_csv(data_path)
    train_df = df[df['year'] < 2018]
    test_df = df[df['year'] >= 2020]
    
    tasks = [
        ('intensity', 8, 1),
        ('category', 8, 6),
        ('ri', 9, 1),
        ('track', 7, 2),
        ('tnumber', 3, 1)
    ]
    
    for task, in_dim, out_dim in tasks:
        train_ds = CycloneDataset(train_df, task)
        test_ds = CycloneDataset(test_df, task)
        
        train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)
        test_loader = DataLoader(test_ds, batch_size=64, shuffle=False)
        
        train_and_eval(task, train_loader, test_loader, in_dim, out_dim, epochs=30)
        
    os.makedirs('/Users/admin/Documents/Cyclone_Project/ml_pipeline/checkpoints', exist_ok=True)
    print("Done training all tasks.")

if __name__ == "__main__":
    main()
