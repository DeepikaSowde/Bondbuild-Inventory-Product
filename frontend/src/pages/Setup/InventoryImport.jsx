import React, { useState } from "react";
import * as XLSX from "xlsx";
import api from "../../services/api";

const InventoryImport = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Import

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    if (
      !selectedFile.name.endsWith(".xlsx") &&
      !selectedFile.name.endsWith(".xls")
    ) {
      setError("Please select a valid Excel file (.xlsx or .xls)");
      return;
    }

    setFile(selectedFile);
    setError("");
    setSuccess("");

    // Read and preview the file
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "binary" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
          setError("Excel file is empty");
          return;
        }

        // Show first 10 rows as preview
        const previewData = data.slice(0, 10);
        const stats = {
          totalRows: data.length,
          uniqueLocations: new Set(data.map((row) => row.LOCATION)).size,
          uniqueProfiles: new Set(data.map((row) => row["Profile Code"])).size,
          totalQty: data.reduce(
            (sum, row) => sum + (parseInt(row["STOCK QTY"]) || 0),
            0,
          ),
        };

        setPreview({
          data: previewData,
          stats: stats,
          fullData: data,
        });
        setStep(2);
        setError("");
      } catch (err) {
        setError(`Error reading file: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleImport = async () => {
    if (!preview || !preview.fullData) {
      setError("No data to import");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Prepare data for API
      const importData = preview.fullData.map((row) => ({
        location_code: row.LOCATION,
        item_code: row["Profile Code"],
        profile_name: row.PROFILE,
        size: row.SIZE,
        length: parseFloat(row.LENGTH) || 0,
        quantity_in_stock: parseInt(row["STOCK QTY"]) || 0,
        unit_price: parseFloat(row.Price) || 0,
        remarks: row.REMARK || "",
      }));

      // Call API to import data
      const response = await api.post("/import/seed", {
        items: importData,
      });

      setSuccess(`✅ Successfully imported ${response.data.imported} items!`);
      setStep(3);
      setFile(null);
      setPreview(null);

      // Redirect to inventory after 2 seconds
      setTimeout(() => {
        window.location.href = "/inventory";
      }, 2000);
    } catch (err) {
      setError(`Import failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            📊 Import Inventory
          </h1>
          <p className="text-slate-300">
            Import factory stock data from Excel file
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex gap-4 mb-8">
          <div
            className={`flex-1 p-4 rounded-lg text-center font-semibold transition ${step >= 1 ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}
          >
            Step 1: Upload
          </div>
          <div
            className={`flex-1 p-4 rounded-lg text-center font-semibold transition ${step >= 2 ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}
          >
            Step 2: Preview
          </div>
          <div
            className={`flex-1 p-4 rounded-lg text-center font-semibold transition ${step >= 3 ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}
          >
            Step 3: Confirm
          </div>
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 shadow-lg">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-4">
                📁 Select Excel File
              </h2>

              <div className="border-2 border-dashed border-slate-500 rounded-lg p-12 text-center hover:border-blue-400 hover:bg-slate-700/50 transition cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="cursor-pointer block">
                  <div className="text-6xl mb-4">📄</div>
                  <p className="text-xl text-white mb-2">
                    Drag and drop your Excel file here
                  </p>
                  <p className="text-slate-400 mb-4">or click to browse</p>
                  <p className="text-sm text-slate-500">
                    Supported: .xlsx, .xls
                  </p>
                </label>
              </div>

              {file && (
                <div className="mt-6 p-4 bg-green-900/30 border border-green-600 rounded-lg">
                  <p className="text-green-300">
                    ✅ File selected: {file.name}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-red-900/30 border border-red-600 rounded-lg text-red-300 mb-6">
                ❌ {error}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 2 && preview && (
          <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 shadow-lg">
            <h2 className="text-2xl font-bold text-white mb-6">
              👀 Preview Data
            </h2>

            {/* Statistics */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-300">
                  {preview.stats.totalRows}
                </div>
                <div className="text-sm text-slate-400">Total Items</div>
              </div>
              <div className="bg-purple-900/30 border border-purple-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-300">
                  {preview.stats.uniqueLocations}
                </div>
                <div className="text-sm text-slate-400">Locations</div>
              </div>
              <div className="bg-green-900/30 border border-green-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-300">
                  {preview.stats.uniqueProfiles}
                </div>
                <div className="text-sm text-slate-400">Profiles</div>
              </div>
              <div className="bg-orange-900/30 border border-orange-600 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-300">
                  {preview.stats.totalQty}
                </div>
                <div className="text-sm text-slate-400">Total Qty</div>
              </div>
            </div>

            {/* Preview Table */}
            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-600">
                    <th className="text-left py-3 px-4 text-slate-200">
                      Location
                    </th>
                    <th className="text-left py-3 px-4 text-slate-200">Code</th>
                    <th className="text-left py-3 px-4 text-slate-200">
                      Profile
                    </th>
                    <th className="text-left py-3 px-4 text-slate-200">Size</th>
                    <th className="text-right py-3 px-4 text-slate-200">
                      Length
                    </th>
                    <th className="text-right py-3 px-4 text-slate-200">Qty</th>
                    <th className="text-right py-3 px-4 text-slate-200">
                      Price
                    </th>
                    <th className="text-left py-3 px-4 text-slate-200">
                      Remark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-700 hover:bg-slate-700/30 transition"
                    >
                      <td className="py-3 px-4">{row.LOCATION}</td>
                      <td className="py-3 px-4 font-mono text-blue-300">
                        {row["Profile Code"]}
                      </td>
                      <td className="py-3 px-4">{row.PROFILE}</td>
                      <td className="py-3 px-4">{row.SIZE}</td>
                      <td className="py-3 px-4 text-right">{row.LENGTH}</td>
                      <td className="py-3 px-4 text-right font-bold text-green-300">
                        {row["STOCK QTY"]}
                      </td>
                      <td className="py-3 px-4 text-right">${row.Price}</td>
                      <td className="py-3 px-4 text-sm text-slate-400">
                        {row.REMARK || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-slate-400 mb-6">
              Showing first 10 rows of {preview.stats.totalRows} items
            </p>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setStep(1);
                  setFile(null);
                  setPreview(null);
                }}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition"
              >
                ← Back
              </button>
              <button
                onClick={handleImport}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "⏳ Importing..." : "✓ Confirm & Import"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center shadow-lg">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-white mb-4">
              Import Successful!
            </h2>
            <p className="text-green-300 text-lg mb-8">{success}</p>
            <p className="text-slate-400 mb-6">
              Redirecting to inventory in 2 seconds...
            </p>
            <a
              href="/inventory"
              className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
            >
              Go to Inventory
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryImport;
