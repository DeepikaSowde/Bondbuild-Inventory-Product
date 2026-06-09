// ============================================================
// ProjectsImport.jsx - Upload and Import Projects (Tailwind CSS)
// ============================================================
// File: frontend/src/pages/Setup/ProjectsImport.jsx

import React, { useState } from "react";
import api from "../../services/api";

const ProjectsImport = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [importedData, setImportedData] = useState(null);

  // ============================================================
  // Handle File Selection
  // ============================================================
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];

    if (!selectedFile) return;

    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (!validTypes.includes(selectedFile.type)) {
      setMessageType("error");
      setMessage("❌ Please select a valid Excel file (.xlsx or .xls)");
      return;
    }

    setFile(selectedFile);
    setMessage(null);
    setImportedData(null);
  };

  // ============================================================
  // Handle File Upload
  // ============================================================
  const handleUpload = async () => {
    if (!file) {
      setMessageType("error");
      setMessage("❌ Please select a file first");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      setMessage(null);

      const formData = new FormData();
      formData.append("file", file);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 30;
        });
      }, 500);

      const response = await api.post("/projects/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.data.success) {
        setMessageType("success");
        setMessage(
          `✅ Successfully imported ${response.data.data.imported} projects!`,
        );
        setImportedData(response.data.data);
        setFile(null);
        document.getElementById("fileInput").value = "";
      } else {
        setMessageType("error");
        setMessage(`❌ ${response.data.message}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setMessageType("error");
      setMessage(
        error.response?.data?.message ||
          "❌ Failed to upload file. Please try again.",
      );
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // ============================================================
  // Clear Message
  // ============================================================
  const clearMessage = () => {
    setMessage(null);
    setImportedData(null);
  };

  return (
    <div className="p-8 md:p-12">
      {/* HEADER */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">
          📊 Projects Import
        </h2>
        <p className="text-gray-600">
          Upload Excel file to import projects into the system
        </p>
      </div>

      {/* ============================================================ */}
      {/* UPLOAD SECTION */}
      {/* ============================================================ */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-xl mb-8 border-2 border-blue-200">
        {/* FILE INPUT */}
        <div className="mb-6">
          <label
            htmlFor="fileInput"
            className={`block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all duration-300 ${
              uploading
                ? "opacity-60 cursor-not-allowed border-gray-300 bg-gray-50"
                : "border-blue-400 hover:border-blue-600 hover:bg-blue-100"
            }`}
          >
            <input
              id="fileInput"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
            <div className="space-y-2">
              <div className="text-5xl">📁</div>
              <div className="font-semibold text-gray-700">
                {file
                  ? `Selected: ${file.name}`
                  : "Choose Excel file or drag & drop"}
              </div>
              <div className="text-sm text-gray-500">
                Maximum file size: 50MB
              </div>
            </div>
          </label>
        </div>

        {/* FILE REQUIREMENTS */}
        <div className="bg-blue-100 border-l-4 border-blue-500 p-4 rounded mb-6">
          <p className="font-bold text-blue-900 mb-2">📋 File Requirements:</p>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>✅ Excel file (.xlsx or .xls)</li>
            <li>✅ Sheet name: "📊 Projects"</li>
            <li>✅ Contains all 46 projects</li>
            <li>✅ File name: InventoryOpz_Projects_Complete.xlsx</li>
          </ul>
        </div>

        {/* UPLOAD BUTTON */}
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className={`w-full py-4 px-6 rounded-lg font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 ${
            uploading
              ? "bg-purple-500 text-white opacity-70 cursor-not-allowed"
              : file
                ? "bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:shadow-lg hover:from-purple-700 hover:to-purple-800"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          {uploading ? (
            <>
              <div className="animate-spin">⏳</div>
              <span>Uploading... {Math.round(uploadProgress)}%</span>
            </>
          ) : (
            <>
              <span>📤</span>
              <span>Upload & Import Projects</span>
            </>
          )}
        </button>

        {/* PROGRESS BAR */}
        {uploading && (
          <div className="mt-6">
            <div className="w-full bg-gray-300 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-purple-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-center text-gray-600 text-sm mt-2">
              {Math.round(uploadProgress)}%
            </p>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MESSAGE SECTION */}
      {/* ============================================================ */}
      {message && (
        <div
          className={`mb-8 p-4 rounded-lg flex justify-between items-center animate-fade-in ${
            messageType === "success"
              ? "bg-green-100 border-l-4 border-green-500 text-green-800"
              : "bg-red-100 border-l-4 border-red-500 text-red-800"
          }`}
        >
          <p className="font-medium">{message}</p>
          <button
            onClick={clearMessage}
            className="text-xl opacity-70 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* IMPORTED DATA SUMMARY */}
      {/* ============================================================ */}
      {importedData && messageType === "success" && (
        <div className="mb-8 bg-white rounded-lg border border-green-200 p-8 animate-fade-in">
          <h3 className="text-2xl font-bold text-gray-800 mb-6">
            📊 Import Summary
          </h3>

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Total Projects */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border-l-4 border-blue-500">
              <div className="text-sm font-semibold text-blue-600 uppercase mb-2">
                Total Projects
              </div>
              <div className="text-4xl font-bold text-blue-700">
                {importedData.total}
              </div>
            </div>

            {/* Successfully Imported */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border-l-4 border-green-500">
              <div className="text-sm font-semibold text-green-600 uppercase mb-2">
                Successfully Imported
              </div>
              <div className="text-4xl font-bold text-green-700">
                {importedData.imported}
              </div>
            </div>

            {/* File Name */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border-l-4 border-purple-500 col-span-1 md:col-span-2 lg:col-span-1">
              <div className="text-sm font-semibold text-purple-600 uppercase mb-2">
                File Name
              </div>
              <div className="text-sm font-bold text-purple-700 truncate">
                {importedData.fileName}
              </div>
            </div>

            {/* Errors (if any) */}
            {importedData.errors.length > 0 && (
              <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-lg border-l-4 border-red-500">
                <div className="text-sm font-semibold text-red-600 uppercase mb-2">
                  Errors
                </div>
                <div className="text-4xl font-bold text-red-700">
                  {importedData.errors.length}
                </div>
              </div>
            )}
          </div>

          {/* ERROR DETAILS */}
          {importedData.errors.length > 0 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
              <h4 className="font-bold text-yellow-900 mb-3">
                ⚠️ Import Errors:
              </h4>
              <ul className="space-y-2">
                {importedData.errors.map((error, index) => (
                  <li key={index} className="text-sm text-yellow-800">
                    <strong className="text-yellow-900">
                      {error.project}:
                    </strong>{" "}
                    {error.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* HELP SECTION */}
      {/* ============================================================ */}
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <h3 className="text-xl font-bold text-gray-800 mb-4">❓ How to use:</h3>
        <ol className="space-y-3 text-gray-700 list-decimal list-inside">
          <li>Download or prepare your Excel file with projects data</li>
          <li>
            Ensure the sheet is named{" "}
            <span className="font-mono bg-gray-100 px-2 py-1 rounded">
              "📊 Projects"
            </span>
          </li>
          <li>Click "Choose Excel file" or drag & drop the file</li>
          <li>Click "Upload & Import Projects" button</li>
          <li>Wait for the import to complete</li>
          <li>View the import summary and verify the data</li>
        </ol>
      </div>
    </div>
  );
};

export default ProjectsImport;
