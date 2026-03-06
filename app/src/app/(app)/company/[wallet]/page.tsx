'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getCompanyByWallet,
  getJobsByPoster,
  type Company,
  type Job,
} from '@/lib/arkiv';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Building2,
  Briefcase,
  MapPin,
  Wifi,
  ExternalLink,
  Loader2,
  DollarSign,
} from 'lucide-react';

export default function CompanyProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const wallet = params.wallet as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [companyData, companyJobs] = await Promise.all([
          getCompanyByWallet(wallet),
          getJobsByPoster(wallet),
        ]);
        setCompany(companyData);
        setJobs(companyJobs.filter((j) => j.status === 'active'));
      } catch (err) {
        console.error('Failed to load company:', err);
        toast({ title: 'Failed to load company', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [wallet, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="w-6 h-6 animate-spin text-foreground" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-border" />
          </div>
          <p className="text-muted-foreground text-sm normal-case">Company profile not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Back
      </button>

      <Card className="bg-card border-border">
        <CardContent className="pt-8 pb-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="w-20 h-20 mb-4">
              <AvatarFallback className="bg-primary/15 text-foreground text-2xl font-bold">
                {company.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <h1 className="text-xl font-bold normal-case">{company.name}</h1>

            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-foreground hover:text-foreground/80 transition-colors mt-1"
              >
                <ExternalLink className="w-3 h-3" />
                {company.website.replace(/^https?:\/\//, '')}
              </a>
            )}

            {company.description && (
              <p className="text-xs text-muted-foreground normal-case mt-4 max-w-md leading-relaxed whitespace-pre-wrap">
                {company.description}
              </p>
            )}

            {company.tags && company.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {company.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-primary/10 text-foreground border border-foreground/30 text-[10px] "
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {jobs.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {jobs.length} active job{jobs.length !== 1 && 's'}
          </p>
          {jobs.map((job) => (
            <Card
              key={job.entityKey}
              className="bg-card border-border hover:border-foreground/30 transition-colors cursor-pointer"
              onClick={() => router.push(`/jobs/${job.entityKey}`)}
            >
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Briefcase className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium normal-case">{job.title}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {job.location && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {job.location}
                        </span>
                      )}
                      {job.isRemote && (
                        <Badge
                          variant="outline"
                          className="border-foreground/30 text-foreground text-[10px]  px-1.5 py-0"
                        >
                          <Wifi className="w-3 h-3 mr-1" />
                          Remote
                        </Badge>
                      )}
                      {job.salary && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <DollarSign className="w-3 h-3" />
                          {job.salary}
                        </span>
                      )}
                    </div>
                    {job.tags && job.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {job.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="bg-primary/10 text-foreground border border-foreground/30 text-[10px] px-1.5 py-0 "
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {jobs.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="py-8 text-center">
            <Briefcase className="w-8 h-8 text-border mx-auto mb-2" />
            <p className="text-xs text-muted-foreground normal-case">No active job listings</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
