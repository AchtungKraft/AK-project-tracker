import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Eye, Edit2, Calendar, Users } from "lucide-react";
import { format } from "date-fns";
import ImageModal from "../ui/ImageModal";

export default function ProjectCard({ project, status, projectType, teamMembers, onEdit }) {
  const [selectedImage, setSelectedImage] = useState(null);
  
  const displayImage = project.featured_image_url || (project.images && project.images[0]);
  const isOverdue = project.target_completion && 
                    new Date(project.target_completion) < new Date() &&
                    status?.label?.toLowerCase() !== 'completed';

  const getTeamNames = (teamIds) => {
    if (!teamIds || teamIds.length === 0) return [];
    return teamIds.map(id => {
      const member = teamMembers.find(m => m.id === id);
      return member?.full_name?.split(' ')[0] || 'Unknown';
    }).slice(0, 3);
  };

  const teamNames = getTeamNames(project.assigned_team);

  return (
    <>
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-700/50 transition-all duration-300 overflow-hidden group">
        {/* Image Section */}
        <div 
          className="relative h-48 bg-gray-900/50 cursor-pointer overflow-hidden"
          onClick={() => displayImage && setSelectedImage(displayImage)}
        >
          {displayImage ? (
            <img
              src={displayImage}
              alt={project.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600">
              <div className="text-center">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No Image</p>
              </div>
            </div>
          )}
          
          {/* Status Badge Overlay */}
          {status && (
            <div className="absolute top-3 right-3">
              <Badge 
                style={{ backgroundColor: status.color }}
                className="text-white shadow-lg"
              >
                {status.label}
              </Badge>
            </div>
          )}
        </div>

        {/* Content Section */}
        <CardContent className="p-5 space-y-4">
          {/* Project Name & Type */}
          <div>
            <h3 className="text-lg font-bold text-white mb-1 line-clamp-1">
              {project.name}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              {projectType && <span>{projectType.name}</span>}
              {project.vin && (
                <>
                  <span>•</span>
                  <span className="font-mono text-xs">{project.vin}</span>
                </>
              )}
            </div>
          </div>

          {/* Client Info */}
          {project.client_name && (
            <div className="text-sm">
              <p className="text-gray-500">Client</p>
              <p className="text-white font-medium">{project.client_name}</p>
            </div>
          )}

          {/* Progress */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500">Progress</span>
              <span className="text-xs text-gray-400 font-medium">
                {project.progress_percent || 0}%
              </span>
            </div>
            <Progress value={project.progress_percent || 0} className="h-2 bg-gray-800" />
          </div>

          {/* Due Date & Team */}
          <div className="flex items-center justify-between text-xs">
            {project.target_completion ? (
              <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                <Calendar className="w-3 h-3" />
                <span>Due {format(new Date(project.target_completion), 'MMM d')}</span>
              </div>
            ) : (
              <div className="text-gray-600">No due date</div>
            )}
            
            {teamNames.length > 0 && (
              <div className="flex items-center gap-1 text-gray-400">
                <Users className="w-3 h-3" />
                <span>{teamNames.join(', ')}</span>
                {project.assigned_team?.length > 3 && (
                  <span>+{project.assigned_team.length - 3}</span>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-800">
            <Link to={createPageUrl("ProjectDetail") + `?id=${project.id}`} className="flex-1">
              <Button 
                variant="outline" 
                className="w-full border-gray-700 hover:bg-red-950/30 hover:border-red-700 text-white gap-2"
              >
                <Eye className="w-4 h-4" />
                View
              </Button>
            </Link>
            <Button 
              variant="outline"
              onClick={() => onEdit(project)}
              className="flex-1 border-gray-700 hover:bg-red-950/30 hover:border-red-700 text-white gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </>
  );
}