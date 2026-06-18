#!/usr/bin/env python3
import tkinter as tk
from tkinter import filedialog, messagebox
import subprocess
import os
import datetime

# Create backup directory if it doesn't exist
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(BASE_DIR, "backup")
if not os.path.exists(BACKUP_DIR):
    os.makedirs(BACKUP_DIR)

def run_backup():
    db_name = db_entry.get().strip()
    if not db_name:
        messagebox.showerror("Error", "Please enter a database name.")
        return

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_name = f"{db_name}_backup_{timestamp}.archive"
    archive_path = os.path.join(BACKUP_DIR, archive_name)

    # mongodump command using archive mode (creates a single file)
    cmd = ["mongodump", "--db", db_name, f"--archive={archive_path}"]
    
    try:
        status_label.config(text="Backing up...", fg="blue")
        root.update()
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            messagebox.showinfo("Success", f"Backup successful!\nSaved as a single archive file to:\n{archive_path}\n\nYou can copy this file to another system to recover it.")
            status_label.config(text="Ready", fg="black")
        else:
            messagebox.showerror("Backup Failed", f"Error:\n{result.stderr}")
            status_label.config(text="Backup failed.", fg="red")
            
    except FileNotFoundError:
        messagebox.showerror("Error", "'mongodump' tool not found.\n\nPlease install 'mongodb-database-tools' to use this feature.")
        status_label.config(text="Tool missing.", fg="red")
    except Exception as e:
        messagebox.showerror("Error", f"An unexpected error occurred:\n{e}")
        status_label.config(text="Error.", fg="red")

def run_restore():
    file_path = filedialog.askopenfilename(
        initialdir=BACKUP_DIR,
        title="Select Backup Archive",
        filetypes=(("Archive files", "*.archive"), ("All files", "*.*"))
    )
    
    if not file_path:
        return # User cancelled

    # mongorestore command using archive mode
    cmd = ["mongorestore", f"--archive={file_path}"]
    
    if drop_var.get():
        cmd.append("--drop")

    try:
        status_label.config(text="Restoring...", fg="blue")
        root.update()
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            messagebox.showinfo("Success", "Restore completed successfully!")
            status_label.config(text="Ready", fg="black")
        else:
            messagebox.showerror("Restore Failed", f"Error:\n{result.stderr}")
            status_label.config(text="Restore failed.", fg="red")
            
    except FileNotFoundError:
        messagebox.showerror("Error", "'mongorestore' tool not found.\n\nPlease install 'mongodb-database-tools' to use this feature.")
        status_label.config(text="Tool missing.", fg="red")
    except Exception as e:
        messagebox.showerror("Error", f"An unexpected error occurred:\n{e}")
        status_label.config(text="Error.", fg="red")

# --- GUI Setup ---
try:
    root = tk.Tk()
except Exception as e:
    print("Failed to initialize Tkinter GUI.")
    print("On Linux/Fedora, you might need to install tkinter:")
    print("sudo dnf install python3-tkinter")
    exit(1)

root.title("MongoDB Backup & Restore")
root.geometry("450x260")
root.resizable(False, False)

# Main Frame
frame = tk.Frame(root, padx=20, pady=20)
frame.pack(expand=True, fill=tk.BOTH)

# Info Label
info_label = tk.Label(frame, text="Easily migrate your database between systems.", fg="gray")
info_label.grid(row=0, column=0, columnspan=2, pady=(0, 15))

# DB Name Entry
tk.Label(frame, text="Database Name:").grid(row=1, column=0, sticky="w", pady=5)
db_entry = tk.Entry(frame, width=25)
db_entry.insert(0, "ExamPrep") # Default DB
db_entry.grid(row=1, column=1, pady=5, sticky="w")

# Drop option for restore
drop_var = tk.BooleanVar()
drop_check = tk.Checkbutton(frame, text="Drop existing data before restoring (Overwrites!)", variable=drop_var)
drop_check.grid(row=2, column=0, columnspan=2, sticky="w", pady=10)

# Buttons
btn_frame = tk.Frame(frame)
btn_frame.grid(row=3, column=0, columnspan=2, pady=10)

backup_btn = tk.Button(btn_frame, text="Take Backup", width=15, bg="#4CAF50", fg="black", font=("Arial", 10, "bold"), command=run_backup)
backup_btn.grid(row=0, column=0, padx=10)

restore_btn = tk.Button(btn_frame, text="Restore DB", width=15, bg="#2196F3", fg="black", font=("Arial", 10, "bold"), command=run_restore)
restore_btn.grid(row=0, column=1, padx=10)

# Status Label
status_label = tk.Label(frame, text="Ready", fg="black")
status_label.grid(row=4, column=0, columnspan=2, pady=5)

root.mainloop()
