import { useState, useCallback } from 'react';
import { Upload, FileText, FileSpreadsheet, CheckCircle2, Loader2, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UploadedFile } from '@/types/schedule';

interface FileUploadZoneProps {
  onUpload: (file: File, type: 'pdf' | 'csv') => void | Promise<void>;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (id: string) => void;
  acceptedTypes?: ('pdf' | 'csv')[];
}

type UploadType = 'pdf' | 'csv';
type UploadItem = {
  file: File;
  type: UploadType;
};

function getFileType(file: File): UploadType | null {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'text/csv' || file.name.endsWith('.csv')) return 'csv';
  return null;
}

export function getOrderedUploadItems(files: File[], acceptedTypes: UploadType[] = ['pdf', 'csv']): UploadItem[] {
  return files
    .map(file => {
      const type = getFileType(file);
      return type && acceptedTypes.includes(type) ? { file, type } : null;
    })
    .filter((item): item is UploadItem => Boolean(item))
    .sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === 'csv' ? -1 : 1;
    });
}

export function FileUploadZone({ 
  onUpload, 
  uploadedFiles, 
  onRemoveFile,
  acceptedTypes = ['pdf', 'csv']
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const pendingFiles = uploadedFiles.filter(file => file.status === 'uploading' || file.status === 'processing');
  const completedPdfCount = uploadedFiles.filter(file => file.type === 'pdf' && file.status === 'completed').length;
  const completedCsvCount = uploadedFiles.filter(file => file.type === 'csv' && file.status === 'completed').length;

  const acceptString = acceptedTypes.map(t => t === 'pdf' ? 'application/pdf' : '.csv,text/csv').join(',');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFiles = useCallback(async (files: File[]) => {
    for (const { file, type } of getOrderedUploadItems(files, acceptedTypes)) {
      await onUpload(file, type);
    }
  }, [acceptedTypes, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    void processFiles(files);
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    void processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const getStatusIcon = (file: UploadedFile) => {
    switch (file.status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-status-match" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin text-accent" />;
    }
  };

  const getFileIcon = (type: 'pdf' | 'csv') => {
    return type === 'pdf' 
      ? <FileText className="w-5 h-5" />
      : <FileSpreadsheet className="w-5 h-5" />;
  };

  return (
    <div className="upload-panel space-y-4">
      <div className="upload-panel-header">
        <div className="min-w-0">
          <p className="upload-panel-kicker">Schedule intake</p>
          <h2 className="upload-panel-title">Upload schedule sources</h2>
        </div>
        <div className="upload-source-summary" aria-label="Uploaded source summary">
          <span className="upload-source-pill upload-source-pill-pdf">
            <FileText className="h-3.5 w-3.5" />
            {completedPdfCount} PDF
          </span>
          <span className="upload-source-pill upload-source-pill-csv">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {completedCsvCount} CSV
          </span>
        </div>
      </div>

      {pendingFiles.length > 0 && (
        <div className="upload-processing-banner">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {pendingFiles.length === 1 ? 'Processing 1 file...' : `Processing ${pendingFiles.length} files...`}
        </div>
      )}

      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "upload-dropzone group",
          isDragging 
            ? "upload-dropzone-active"
            : "upload-dropzone-idle"
        )}
      >
        <input
          type="file"
          accept={acceptString}
          onChange={handleFileSelect}
          multiple
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="upload-dropzone-grid">
          <div className="upload-icon-stage" aria-hidden="true">
            <span className="upload-icon-ring upload-icon-ring-one" />
            <span className="upload-icon-ring upload-icon-ring-two" />
            <div className={cn(
              "upload-icon-core",
              isDragging && "upload-icon-core-active"
            )}>
              <Upload className="h-6 w-6" />
            </div>
            <span className="upload-format-badge upload-format-badge-pdf">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <span className="upload-format-badge upload-format-badge-csv">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="upload-dropzone-copy flex w-full min-w-0 max-w-xl flex-col items-center text-center lg:items-start lg:text-left">
            <h3 className="mb-2 text-xl font-semibold text-slate-950 sm:text-2xl">
              {isDragging ? "Drop files to start processing" : "Drop PDF and CSV files here"}
            </h3>
            <p className="mb-5 max-w-xl text-sm leading-6 text-slate-500">
              Upload source schedules and compare parsed class data across studio locations.
            </p>
            
            <div className="flex w-full flex-col items-center justify-center gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap lg:justify-start">
              {acceptedTypes.includes('pdf') && (
                <Button variant="outline" size="sm" className="pointer-events-none h-9 w-full max-w-[220px] justify-center gap-2 rounded-md border-red-200 bg-red-50 text-red-700 shadow-none sm:w-auto">
                  <FileText className="w-4 h-4" />
                  PDF schedule
                </Button>
              )}
              {acceptedTypes.includes('csv') && (
                <Button variant="outline" size="sm" className="pointer-events-none h-9 w-full max-w-[220px] justify-center gap-2 rounded-md border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none sm:w-auto">
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV export
                </Button>
              )}
            </div>
          </div>

          <div className="upload-dropzone-note" aria-hidden="true">
            <div className="upload-note-row">
              <span className="upload-note-dot upload-note-dot-pdf" />
              PDF parser
            </div>
            <div className="upload-note-row">
              <span className="upload-note-dot upload-note-dot-csv" />
              CSV matcher
            </div>
            <div className="upload-note-row">
              <span className="upload-note-dot upload-note-dot-compare" />
              Side-by-side review
            </div>
          </div>
        </div>
        <div className="sr-only">
          <h3>{isDragging ? "Drop files to start processing" : "Drop PDF and CSV files here"}</h3>
          <p>Upload PDF schedules or CSV files.</p>
        </div>
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="upload-files-section space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <FileSpreadsheet className="w-4 h-4" />
            Uploaded Files ({uploadedFiles.length})
          </h4>
          <div className="grid gap-2">
            {uploadedFiles.map((file, index) => (
              <div 
                key={file.id}
                className={cn(
                  "upload-file-row flex items-center gap-3 rounded-lg border bg-white p-3",
                  file.status === 'error' ? "border-red-200 bg-red-50" : "border-slate-200 hover:border-slate-300"
                )}
                style={{ animationDelay: `${Math.min(index * 45, 270)}ms` }}
              >
                <div className={cn(
                  "upload-file-icon flex h-9 w-9 items-center justify-center rounded-md",
                  file.type === 'pdf' ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                )}>
                  {getFileIcon(file.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                    <span className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      file.type === 'pdf' ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                    )}>
                      {file.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {file.status === 'uploading' && 'Uploading...'}
                    {file.status === 'processing' && 'Processing file...'}
                    {file.status === 'completed' && 'Ready for comparison'}
                    {file.status === 'error' && (file.error || 'Failed to process')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusIcon(file)}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => onRemoveFile(file.id)}
                    className="text-slate-400 hover:text-red-600 h-8 w-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
