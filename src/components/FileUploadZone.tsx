import { useState, useCallback } from 'react';
import { Upload, FileText, FileSpreadsheet, CheckCircle2, Loader2, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UploadedFile } from '@/types/schedule';

interface FileUploadZoneProps {
  onUpload: (file: File, type: 'pdf' | 'csv') => void;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (id: string) => void;
  acceptedTypes?: ('pdf' | 'csv')[];
}

export function FileUploadZone({ 
  onUpload, 
  uploadedFiles, 
  onRemoveFile,
  acceptedTypes = ['pdf', 'csv']
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const acceptString = acceptedTypes.map(t => t === 'pdf' ? 'application/pdf' : '.csv,text/csv').join(',');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const getFileType = (file: File): 'pdf' | 'csv' | null => {
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) return 'csv';
    return null;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const type = getFileType(file);
      if (type && acceptedTypes.includes(type)) {
        onUpload(file, type);
      }
    }
  }, [onUpload, acceptedTypes]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const type = getFileType(file);
      if (type && acceptedTypes.includes(type)) {
        onUpload(file, type);
      }
    }
    e.target.value = '';
  }, [onUpload, acceptedTypes]);

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
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-12 transition-all duration-200",
          "bg-white/70 backdrop-blur-sm",
          isDragging 
            ? "border-[#0353A4] bg-white scale-[1.01] shadow-elevated"
            : "border-slate-200 hover:border-[#0353A4]/40 shadow-soft"
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
            "w-16 h-16 rounded-xl flex items-center justify-center mb-5 transition-all duration-200",
            isDragging 
              ? "gradient-primary text-white shadow-elevated animate-gradient-shift" 
              : "gradient-primary text-white shadow-card"
          )}>
            <Upload className="w-7 h-7 icon-tilt" />
          </div>
          
          <h3 className="text-xl font-display font-semibold mb-2 text-slate-900">
            {isDragging ? "Drop your files here" : "Drag & Drop your schedule files"}
          </h3>
          <p className="text-slate-600 max-w-md mb-5">
            Upload PDF schedules or CSV files to compare and verify your class data.
            We'll extract and normalize all information automatically.
          </p>
          
          <div className="flex gap-3">
            {acceptedTypes.includes('pdf') && (
              <Button variant="outline" className="pointer-events-none gap-2 text-slate-700">
                <FileText className="w-4 h-4" />
                PDF
              </Button>
            )}
            {acceptedTypes.includes('csv') && (
              <Button variant="outline" className="pointer-events-none gap-2 text-slate-700">
                <FileSpreadsheet className="w-4 h-4" />
                CSV
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-600 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Uploaded Files ({uploadedFiles.length})
          </h4>
          <div className="grid gap-3">
            {uploadedFiles.map((file) => (
              <div 
                key={file.id}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl border bg-white transition-all shadow-sm",
                  file.status === 'error' ? "border-red-200 bg-red-50" : "border-slate-200 hover:border-blue-300 hover:shadow-md"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  file.type === 'pdf' ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                )}>
                  {getFileIcon(file.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate text-slate-900">{file.name}</p>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium uppercase",
                      file.type === 'pdf' ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                    )}>
                      {file.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
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
