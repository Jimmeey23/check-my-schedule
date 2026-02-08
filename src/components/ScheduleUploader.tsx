import { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UploadedPDF } from '@/types/schedule';

interface ScheduleUploaderProps {
  onUpload: (file: File) => void;
  uploadedFiles: UploadedPDF[];
  onRemoveFile: (id: string) => void;
}

export function ScheduleUploader({ onUpload, uploadedFiles, onRemoveFile }: ScheduleUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find(f => f.type === 'application/pdf');
    if (pdfFile) {
      onUpload(pdfFile);
    }
  }, [onUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      onUpload(file);
    }
    e.target.value = '';
  }, [onUpload]);

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-12 transition-all duration-300 ease-out",
          "bg-card hover:bg-muted/50",
          isDragging 
            ? "border-primary bg-primary/5 scale-[1.02] shadow-glow" 
            : "border-border hover:border-primary/50"
        )}
      >
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="flex flex-col items-center text-center">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300",
            isDragging 
              ? "bg-primary text-primary-foreground shadow-glow" 
              : "bg-secondary text-secondary-foreground"
          )}>
            <Upload className="w-8 h-8" />
          </div>
          
          <h3 className="text-xl font-display font-semibold mb-2">
            {isDragging ? "Drop your PDF here" : "Upload Schedule PDF"}
          </h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Drag and drop your weekly schedule PDF, or click to browse. 
            We'll extract all class information automatically.
          </p>
          
          <Button variant="outline" className="pointer-events-none">
            <FileText className="w-4 h-4 mr-2" />
            Choose PDF File
          </Button>
        </div>
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Uploaded Files</h4>
          {uploadedFiles.map((file) => (
            <div 
              key={file.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border shadow-soft animate-fade-in"
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                file.status === 'completed' ? "bg-level-beginner/10 text-level-beginner" :
                file.status === 'error' ? "bg-destructive/10 text-destructive" :
                "bg-secondary text-secondary-foreground"
              )}>
                {file.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : file.status === 'error' ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Loader2 className="w-5 h-5 animate-spin" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {file.status === 'uploading' && 'Uploading...'}
                  {file.status === 'processing' && 'Extracting schedule...'}
                  {file.status === 'completed' && 'Schedule extracted'}
                  {file.status === 'error' && 'Failed to process'}
                </p>
              </div>

              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => onRemoveFile(file.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
