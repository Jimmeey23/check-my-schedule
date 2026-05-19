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
    <div className="space-y-4">
      {pendingFiles.length > 0 && (
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {pendingFiles.length === 1 ? 'Processing 1 file…' : `Processing ${pendingFiles.length} files…`}
        </div>
      )}

      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-xl border border-dashed p-8 transition-colors duration-150",
          "bg-white",
          isDragging 
            ? "border-slate-500 bg-slate-50"
            : "border-slate-300 hover:border-slate-500"
        )}
      >
        <input
          type="file"
          accept={acceptString}
          onChange={handleFileSelect}
          multiple
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="flex flex-col items-center text-center">
          <div className={cn(
            "mb-4 flex h-12 w-12 items-center justify-center rounded-lg transition-colors duration-150",
            isDragging 
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700"
          )}>
            <Upload className="h-5 w-5" />
          </div>
          
          <h3 className="mb-1 text-base font-semibold text-slate-900">
            {isDragging ? "Drop your files here" : "Drag & Drop your schedule files"}
          </h3>
          <p className="mb-4 max-w-md text-sm leading-6 text-slate-500">
            Upload PDF schedules or CSV files to compare and verify your class data.
            We'll extract and normalize all information automatically.
          </p>
          
          <div className="flex gap-3">
            {acceptedTypes.includes('pdf') && (
              <Button variant="outline" size="sm" className="pointer-events-none gap-2 text-slate-700">
                <FileText className="w-4 h-4" />
                PDF
              </Button>
            )}
            {acceptedTypes.includes('csv') && (
              <Button variant="outline" size="sm" className="pointer-events-none gap-2 text-slate-700">
                <FileSpreadsheet className="w-4 h-4" />
                CSV
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <FileSpreadsheet className="w-4 h-4" />
            Uploaded Files ({uploadedFiles.length})
          </h4>
          <div className="grid gap-2">
            {uploadedFiles.map((file) => (
              <div 
                key={file.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-white p-3 transition-colors",
                  file.status === 'error' ? "border-red-200 bg-red-50" : "border-slate-200 hover:border-slate-300"
                )}
              >
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md",
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
