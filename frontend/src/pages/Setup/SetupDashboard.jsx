// ============================================================
// SetupDashboard.jsx - Setup page with Tabs (Tailwind CSS)
// ============================================================
// File: frontend/src/pages/Setup/SetupDashboard.jsx

import React, { useState } from "react";
import InventoryImport from "./InventoryImport";
import ProjectsImport from "./ProjectsImport";

const SetupDashboard = () => {
  const [activeTab, setActiveTab] = useState("inventory");

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-purple-800 p-8">
      {/* ============================================================ */}
      {/* HEADER */}
      {/* ============================================================ */}
      <div className="text-center text-white mb-12 animate-fade-in">
        <h1 className="text-4xl font-bold mb-3 tracking-tight">
          🛠️ Setup Dashboard
        </h1>
        <p className="text-lg opacity-90 font-light">
          Import inventory items and projects into the system
        </p>
      </div>

      {/* ============================================================ */}
      {/* TABS CONTAINER */}
      {/* ============================================================ */}
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* TABS HEADER */}
        <div className="flex bg-gray-100 border-b-2 border-gray-200">
          <button
            onClick={() => setActiveTab("inventory")}
            className={`flex-1 py-6 px-8 font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 border-b-4 ${
              activeTab === "inventory"
                ? "text-purple-600 bg-white border-purple-600"
                : "text-gray-600 border-transparent hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <span className="text-2xl">📦</span>
            <span>Inventory Import</span>
          </button>
          <button
            onClick={() => setActiveTab("projects")}
            className={`flex-1 py-6 px-8 font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 border-b-4 ${
              activeTab === "projects"
                ? "text-purple-600 bg-white border-purple-600"
                : "text-gray-600 border-transparent hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <span className="text-2xl">📊</span>
            <span>Projects Import</span>
          </button>
        </div>

        {/* TABS CONTENT */}
        <div className="p-0">
          {activeTab === "inventory" && (
            <div className="animate-fade-in">
              <InventoryImport />
            </div>
          )}

          {activeTab === "projects" && (
            <div className="animate-fade-in">
              <ProjectsImport />
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* INFO SECTION */}
      {/* ============================================================ */}
      <div className="max-w-4xl mx-auto mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up-delay">
        {/* File Format Card */}
        <div className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <div className="text-4xl mb-4">📁</div>
          <h4 className="font-bold text-gray-800 mb-2 text-lg">File Format</h4>
          <p className="text-gray-600 text-sm leading-relaxed">
            Excel files (.xlsx or .xls) with specific sheet names
          </p>
        </div>

        {/* Validation Card */}
        <div className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <div className="text-4xl mb-4">✅</div>
          <h4 className="font-bold text-gray-800 mb-2 text-lg">Validation</h4>
          <p className="text-gray-600 text-sm leading-relaxed">
            All data is validated before import
          </p>
        </div>

        {/* Speed Card */}
        <div className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <div className="text-4xl mb-4">⚡</div>
          <h4 className="font-bold text-gray-800 mb-2 text-lg">Speed</h4>
          <p className="text-gray-600 text-sm leading-relaxed">
            Fast import of large datasets
          </p>
        </div>

        {/* Updates Card */}
        <div className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <div className="text-4xl mb-4">🔄</div>
          <h4 className="font-bold text-gray-800 mb-2 text-lg">Updates</h4>
          <p className="text-gray-600 text-sm leading-relaxed">
            Re-import to update existing records
          </p>
        </div>
      </div>
    </div>
  );
};

export default SetupDashboard;
