export interface FileStoragePort {
  /**
   * Save a file to storage
   * @param file - The uploaded file
   * @param destinationPath - Relative path where file should be stored
   * @returns The public URL/path to access the file
   */
  save(file: Express.Multer.File, destinationPath: string): Promise<string>;

  /**
   * Delete a file from storage
   * @param filePath - The path/URL of the file to delete
   */
  delete(filePath: string): Promise<void>;
}
