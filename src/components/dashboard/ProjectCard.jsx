import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Eye, Edit2, Calendar, Users, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import ImageModal from "../ui/ImageModal";

export default function ProjectCard({ project, status, projectType, teamMembers, onEdit, needsAttention = false, attentionMessage = '' }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const navigate = useNavigate();

  const displayImage = project.featured_image_url || project.images && project.images[0];
  const isOverdue = project.target_completion &&
  new Date(project.target_completion) < new Date() &&
  status?.label?.toLowerCase() !== 'completed';

  const getTeamNames = (teamIds) => {
    if (!teamIds || teamIds.length === 0) return [];
    return teamIds.map((id) => {
      const member = teamMembers.find((m) => m.id === id);
      return member?.full_name?.split(' ')[0] || 'Unknown';
    }).slice(0, 3);
  };

  const teamNames = getTeamNames(project.assigned_team);

  // Mobile tap handler - make entire card tappable on mobile
  const handleMobileCardTap = (e) => {
    // Only trigger on mobile (check if it's a touch device and no buttons were clicked)
    if (window.innerWidth < 768 && !e.target.closest('button')) {
      navigate(createPageUrl("ProjectDetail") + `?id=${project.id}`);
    }
  };

  return (
    <>
      <Card 
        className={`bg-black/40 backdrop-blur-xl border hover:border-red-700/50 transition-all duration-300 overflow-hidden group md:cursor-default cursor-pointer ${
          needsAttention ? 'border-l-4 border-l-amber-500 border-red-900/30' : 'border-red-900/30'
        }`}
        onClick={handleMobileCardTap}
      >
        {/* Image Section - Tighter on mobile */}
        <div
          className="relative h-28 md:h-40 bg-gray-900/50 md:cursor-pointer overflow-hidden"
          onClick={(e) => {
            e.stopPropagation();
            if (window.innerWidth >= 768 && displayImage) {
              setSelectedImage(displayImage);
            }
          }}>

          {displayImage ?
          <img
            src={displayImage}
            alt={project.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /> :


          <div className="w-full h-full flex items-center justify-center text-gray-600">
              <div className="text-center">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No Image</p>
              </div>
            </div>
          }
          
          {/* Status Badge Overlay */}
          {status &&
          <div className="absolute top-2 right-2">
              <Badge
              style={{ backgroundColor: status.color }}
              className="text-white shadow-lg text-xs">

                {status.label}
              </Badge>
            </div>
          }
        </div>

        {/* Content Section */}
        <CardContent className="p-4 space-y-3">
          {/* Project Name & Type */}
          <div>
            <h3 className="text-base font-bold text-white mb-0.5 line-clamp-1">
              {project.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {projectType && <span>{projectType.name}</span>}
              {project.vin &&
              <>
                  <span>•</span>
                  <span className="font-mono">{project.vin}</span>
                </>
              }
            </div>
          </div>

          {/* Client Info */}
          {project.client_name &&
          <div className="text-sm">
              <p className="text-gray-500 text-xs">Client</p>
              <p className="text-white font-medium">{project.client_name}</p>
            </div>
          }



          {/* Due Date & Team */}
          <div className="flex items-center justify-between text-xs">
            {project.target_completion ?
            <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-gray-400'}`}>
                <Calendar className="w-3 h-3" />
                <span>Due {format(new Date(project.target_completion), 'MMM d')}</span>
              </div> :

            <div className="text-gray-600">No due date</div>
            }
            
            {teamNames.length > 0 &&
            <div className="flex items-center gap-1 text-gray-400">
                <Users className="w-3 h-3" />
                <span>{teamNames.join(', ')}</span>
                {project.assigned_team?.length > 3 &&
              <span>+{project.assigned_team.length - 3}</span>
              }
              </div>
            }
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-800">
            <Link to={createPageUrl("ProjectDetail") + `?id=${project.id}`} className="flex-1">
              <Button
                variant="outline"
                size="sm" className="bg-lime-600 text-white px-3 text-xs font-medium rounded-md inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:text-accent-foreground h-8 w-full border-gray-700 hover:bg-red-950/30 hover:border-red-700 gap-2">


                <Eye className="w-3 h-3" />
                View
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(project)} className="bg-neutral-700 text-white px-3 text-xs font-medium rounded-md inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:text-accent-foreground h-8 flex-1 border-gray-700 hover:bg-red-950/30 hover:border-red-700 gap-2">


              <Edit2 className="w-3 h-3" />
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>

      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage} />

    </>);

}