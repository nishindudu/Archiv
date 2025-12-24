import os
import json
import time
from io import BytesIO
from PIL import Image
from mimetypes import guess_type
from operator import itemgetter
from werkzeug.utils import secure_filename
from flask import request, jsonify, render_template, redirect, send_from_directory, url_for, Flask, send_file

app = Flask(__name__, template_folder='frontend/templates', static_folder='frontend/static')

class Storage:
    def __init__(self):
        self.data = {}
        self.location = "data"
        self.db = os.path.join(self.location, "db", "files.json")
    
    def generate_thumbnail(self, filename):
        if filename.endswith(('.png', '.jpg', '.jpeg', '.gif')):
            img = Image.open(os.path.join(self.location, filename))
            img.thumbnail((128, 128))

            thumbnail_path = os.path.join(self.location, "db", "thumbnails", f"thumb_{filename}")
            if not os.path.exists(os.path.dirname(thumbnail_path)):
                os.makedirs(os.path.dirname(thumbnail_path))

            img.save(thumbnail_path)
            return thumbnail_path
        
        if filename.endswith(('.mp4', '.avi', '.mov', '.mkv')):
            pass

    def delete_thumbnail(self, filename):
        thumb_path = os.path.join(self.location, "db", "thumbnails", f"thumb_{filename}")
        if os.path.exists(thumb_path):
            os.remove(thumb_path)

    def edit_thumbnail(self, old_filename, new_filename):
        old_thumb_path = os.path.join(self.location, "db", "thumbnails", f"thumb_{old_filename}")
        new_thumb_path = os.path.join(self.location, "db", "thumbnails", f"thumb_{new_filename}")
        if os.path.exists(old_thumb_path):
            os.rename(old_thumb_path, new_thumb_path)
    
    def add_file_to_db(self, filename):
        thumb = self.generate_thumbnail(filename)
        db_entry = [{
            "filename": filename,
            "thumbnail": thumb,
            "date_added": str((time.time())),
            "file_size": os.path.getsize(os.path.join(self.location, filename)),
            "tags": []
        }]

        os.makedirs(os.path.dirname(self.db), exist_ok=True)
        try:
            with open(self.db, 'r') as f:
                data = json.load(f)
                data = [data] if isinstance(data, dict) else data
        except (FileNotFoundError, json.JSONDecodeError):
            data = []
        
        data.extend(db_entry)
        json.dump(data, open(self.db, 'w'), indent=4)

    def remove_file_from_db(self, filename):
        try:
            with open(self.db, 'r') as f:
                data = json.load(f)
                data = [data] if isinstance(data, dict) else data
        except (FileNotFoundError, json.JSONDecodeError):
            data = []
        data = [entry for entry in data if entry['filename'] != filename]
        json.dump(data, open(self.db, 'w'), indent=4)
    
    def edit_db_filename(self, old_filename, new_filename):
        try:
            with open(self.db, 'r') as f:
                data = json.load(f)
                data = [data] if isinstance(data, dict) else data
        except (FileNotFoundError, json.JSONDecodeError):
            data = []
        
        for entry in data:
            if entry['filename'] == old_filename:
                entry['filename'] = new_filename
                break
        json.dump(data, open(self.db, 'w'), indent=4)
    
    def add_file(self, filename, content):
        content.save(os.path.join(self.location, filename))
        self.add_file_to_db(filename)
        return True
    
    def delete_file(self, filename):
        filepath = os.path.join(self.location, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            self.remove_file_from_db(filename)
            self.delete_thumbnail(filename)
            return True
        return False
    
    def edit_filename(self, old_filename, new_filename):
        old_filepath = os.path.join(self.location, old_filename)
        new_filename = f"{new_filename}.{old_filename.split('.')[-1]}"
        if os.path.exists(os.path.join(self.location, new_filename)):
            return False
        new_filepath = os.path.join(self.location, new_filename)
        if os.path.exists(old_filepath):
            os.rename(old_filepath, new_filepath)
            self.edit_db_filename(old_filename, new_filename)
            self.edit_thumbnail(old_filename, new_filename)
            return True
        return False
    
    def get_file_list(self):
        if not os.path.exists(self.db):
            os.makedirs(os.path.dirname(self.db), exist_ok=True)
            with open(self.db, 'w') as f:
                json.dump([], f)
        with open(self.db, 'r') as f:
            data = json.load(f)
            data = [data] if isinstance(data, dict) else data
        return data
    
    def get_file(self, filename):
        filepath = os.path.join(self.location, filename)
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                return f.read()
        return None

@app.route('/')
def home():
    return render_template('index.html')

@app.errorhandler(404)
def page_not_found(e):
    return redirect(url_for('home'))

@app.route('/static/icon/<path:filename>')
def serve_icon(filename):
    return send_from_directory(os.path.join('frontend', 'static', 'icons'), filename)

@app.route('/data/add', methods=['POST'])
def add_data():
    if 'files' not in request.files:
        print("no files")
        return jsonify({"error": "No files part in the request"}), 400
    files = request.files.getlist('files')

    if len(files) == 0:
        print("len 0")
        return jsonify({"error": "No files uploaded"}), 400
    
    storage = Storage()
    for file in files:
        if file.filename != '':
            filename = secure_filename(file.filename)
            storage.add_file(filename, file)
    
    return jsonify({"message": "Files uploaded successfully"}), 200

@app.route('/data/list', methods=['GET'])
def list_data():
    storage = Storage()
    data = storage.get_file_list()
    
    start = int(request.args.get('start', default=0))
    end = int(request.args.get('end', default=30))
    sort = request.args.get('sort', default='date_added')
    reversed = request.args.get('reversed', default='true').lower() == 'false'

    if sort in ['date_added', 'file_size', 'filename'] or reversed == True:
        if sort == 'date_added':
            data = sorted(data, key=itemgetter(sort), reverse=reversed)
        else:
            data = sorted(data, key=itemgetter(sort), reverse=reversed)

    return jsonify(data[start:end])

@app.route('/data/count', methods=['GET'])
def count_data():
    storage = Storage()
    data = storage.get_file_list()
    return jsonify({"count": len(data)})

@app.route('/data/file/<filename>', methods=['GET', 'DELETE', 'PUT'])
def get_file(filename):
    storage = Storage()

    if request.method == 'DELETE':
        success = storage.delete_file(filename)
        if success:
            return jsonify({"message": "File deleted successfully"}), 200
        else:
            return jsonify({"error": "File not found"}), 404
    elif request.method == 'PUT':
        new_filename = request.json.get('new_filename')
        if not new_filename:
            print("No new filename provided")
            return jsonify({"error": "New filename not provided"}), 400
        success = storage.edit_filename(filename, new_filename)
        if success:
            return jsonify({"message": "Filename updated successfully"}), 200
        else:
            return jsonify({"error": "File not found"}), 404
        
    file = storage.get_file(filename)
    if file:
        mime_type, _ = guess_type(filename)
        return send_file(BytesIO(file), mimetype=mime_type or 'application/octet-stream')
    else:
        return jsonify({"error": "File not found"}), 404
    
@app.route('/data/thumbnail/<filename>', methods=['GET'])
def get_thumbnail(filename):
    storage = Storage()
    thumb_filename = f"thumb_{filename}"
    thumb = storage.get_file(os.path.join("db", "thumbnails", thumb_filename))
    if thumb:
        mime_type, _ = guess_type(thumb_filename)
        return send_file(BytesIO(thumb), mimetype=mime_type or 'application/octet-stream')
    else:
        return jsonify({"error": "Thumbnail not found"}), 404
    

@app.route('/data/info', methods=['GET'])
def get_info():
    storage = Storage()
    data = storage.get_file_list()
    total_files = len(data)
    total_size = sum(entry['file_size'] for entry in data)
    return jsonify({
        "storage_used": total_size,
        "total_files": total_files,
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)