import { supabase } from "@/lib/supabase";

export async function GET() {
    try {

        const { data, error } = await supabase
            .from("recipes")
            .select("*")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            throw error;
        }

        return Response.json(data);

    } catch (error: any) {

        return Response.json(
            {
                error: error.message
            },
            {
                status: 500
            }
        );

    }
}


export async function POST(
    request: Request
) {

    try {

        const recipe =
            await request.json();

        const { data, error } =
            await supabase
                .from("recipes")
                .insert({

                    id:
                        recipe.id,

                    title:
                        recipe.title,

                    source_url:
                        recipe.sourceUrl || null,

                    image_url:
                        recipe.imageUrl || null,

                    category:
                        recipe.category ||
                        "Senza categoria",

                    tags:
                        recipe.tags || [],

                    ingredients:
                        recipe.ingredients || [],

                    steps:
                        recipe.steps || [],

                    notes:
                        recipe.notes || null,

                    prep_time_minutes:
                        recipe.prepTimeMinutes || null,

                    cook_time_minutes:
                        recipe.cookTimeMinutes || null,

                    total_time_minutes:
                        recipe.totalTimeMinutes || null,

                    servings:
                        recipe.servings || null,

                    nutrition:
                        recipe.nutrition || null,

                    created_at:
                        recipe.createdAt

                })
                .select()
                .single();

        if (error) {
            throw error;
        }

        return Response.json(data);

    } catch (error: any) {

        return Response.json(
            {
                error: error.message
            },
            {
                status: 500
            }
        );

    }
}